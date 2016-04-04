"use strict";

if(process.argv.length < 3) {
  console.log("Usage: node gifread.js [filename]");
  process.exit();
} else {
  filename = process.argv[2];
}

var fs = require('fs'),
    _  = require('lodash'),
	filename;

var BREAK = '\n======\n',
  SIZES = {
    SIGNATURE: 3,
    VERSION: 3,
    COLOR: 3,
    UNSIGNED: 2,
    BYTE: 1
  },
  CONSTANTS = {
    GIF_SIGNATURE: "GIF",
    VERSIONS: {
     "87a": "May 1987",
     "89a": "July 1989"
    },
	BLOCKS: {
    PLAINTEXT: "01",
    GRAPHICS_CONTROL_EXTENSION: "21",
    IMAGE_DESCRIPTOR: "2c",
    TRAILER: "3b",
    COMMENT_EXTENSION: "fe",
    APPLICATION_EXTENSION: "ff"
  }
};

function Color(buffer) { 
  this.buffer = buffer;
  this.red = this.buffer.getNext(SIZES.BYTE).toInt();
  this.green =  this.buffer.getNext(SIZES.BYTE).toInt();
  this.blue = this.buffer.getNext(SIZES.BYTE).toInt();
  this.toString = () => {
    return "\tR" + this.red + "\tG" + this.green + "\tB" + this.blue
  }
}

function LinearBuffer(buffer) {
  insist(typeof buffer !== "undefined", "Could not initialize buffer. Does file exist?");
  
  this.buffer = buffer;
  this.position = 0;
  
  this.getNext = (bytes) => {
    return new LinearBuffer(this.buffer.slice(this.position,this.position += bytes))
  };
  this.peekNext = (bytes) => { // Identical, but doesn't change position
    return new LinearBuffer(this.buffer.slice(this.position,this.position + bytes))
  };
  this.toString = (encoding) => {
    return this.buffer.toString.call(this.buffer, encoding)
  };
  this.slice = (args) => {
    return this.buffer.slice.call(this.buffer, arguments)
  };
  this.forEvery = (bytelength, callback) => {
    while(this.position + bytelength <= this.buffer.length) {
	    callback(this.getNext(bytelength))
	  }
  };
  this.toInt = (encoding) => {
    return parseInt(this.buffer.toString('hex'), 16)
  };
  this.getLength = () => {
    return this.buffer.length
  };
}

function insist(predicate, error) {
  if(predicate) {
    return true;
  } else {
    console.log(error);
	  process.exit();
  }
}

var image = () => {
  this.data = undefined
  this.colors = [] // Should have indexes identical to the colors' indexes in the file's color table 
  this.checkBitFlag = (number, bit) => {
    var bitInt = Math.pow(2, 8 - bit);
    return (number & bitInt) === bitInt
  };
  this.unpackInteger = (number, startBit, endBit) => {
    // Parses from startBit to endBit of number as an n-bit little-endian integer
    var bits = [];
    for(var i = startBit; i <= endBit; i++) {
      bits.unshift(this.checkBitFlag(number, i))
    }

    return _.reduce(bits, (memo, bit, index) => {
        return memo + ((bit ? 1 : 0) * Math.pow(2, index))
      }, 0);
  };
  
  this.parse = {
      header: () => {
      this.signature = this.data.getNext(SIZES.SIGNATURE);
      insist(this.signature.toString() === CONSTANTS.GIF_SIGNATURE, "Not a valid GIF: GIF signature not present");

      this.version = this.data.getNext(SIZES.VERSION);
      insist(typeof CONSTANTS.VERSIONS[this.version.toString()] !== "undefined", "Not a valid GIF: Version must be 87a or 89a, got " + this.version.toString());

      this.explain.header();
    },
    logicalScreenDescriptor: () => {
      this.logicalScreenWidth = this.data.getNext(SIZES.UNSIGNED).buffer.readInt16LE();
      this.logicalScreenHeight = this.data.getNext(SIZES.UNSIGNED).buffer.readInt16LE();

      // Start packed GCT fields

      var packedFields = this.data.getNext(SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.globalColorTableFlag = this.checkBitFlag(packedFieldsInt, 1);
      this.colorResolution = this.unpackInteger(packedFieldsInt, 2, 4);
      this.globalColorTableSortFlag = this.checkBitFlag(packedFieldsInt, 5);

      // Per spec, the GCT size is stored in the 3 least significant bits of the packed fields: "To determine [the] actual size of the color table, raise 2 to [the value of the field + 1]"
      this.globalColorTableSizeRaw = this.unpackInteger(packedFieldsInt, 5, 8);
        this.globalColorTableSize = Math.pow(2, (this.unpackInteger(packedFieldsInt, 5, 8) + 1));

        // End packed GCT fields

      this.backgroundColorIndex = this.data.getNext(SIZES.BYTE).toInt();
      this.pixelAspectRatio = this.data.getNext(SIZES.BYTE).toInt();

      this.explain.logicalScreenDescriptor()
    },
    globalColorTable: () => {
      this.globalColorTable = this.data.getNext(3 * this.globalColorTableSize);
      this.globalColorTable.forEvery(SIZES.COLOR, (colorBuffer) => {
          this.colors.push(new Color(colorBuffer));
      });
      this.explain.globalColorTable();
    },
    localColorTable: () => {
      console.log("LCT Incomplete; bugs a-comin");
      this.localColorTable = this.data.getNext(3 * this.globalColorTableSize);
      this.localColorTable.forEvery(SIZES.COLOR, (colorBuffer) => {
        this.colors.push(new Color(colorBuffer));
      });
      this.explain.localColorTable();
    },
    imageDescriptor: () => {
      this.imageSeparator = this.data.getNext(SIZES.BYTE);
      this.imageLeftPosition = this.data.getNext(SIZES.UNSIGNED);
      this.imageTopPosition = this.data.getNext(SIZES.UNSIGNED);
      this.imageWidth = this.data.getNext(SIZES.UNSIGNED);
      this.imageHeight = this.data.getNext(SIZES.UNSIGNED);

       // Start packed image descriptor fields
      var packedFields = this.data.getNext(SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.localColorTableFlag = this.checkBitFlag(packedFieldsInt, 1);
      this.localColorTableInterlaceFlag = this.unpackInteger(packedFieldsInt, 2, 4);
      this.localColorTableSortFlag = this.checkBitFlag(packedFieldsInt, 5);
      this.localColorTableSize = this.unpackInteger(packedFieldsInt, 5, 8);
      // End packed image descriptor fields

      this.explain.imageDescriptor()
    },
    graphicsControlExtension: () => {
      this.extensionBlock = this.data.getNext(SIZES.BYTE);
      this.graphicControlLabel = this.data.getNext(SIZES.BYTE);
      this.blockSize = this.data.getNext(SIZES.BYTE);

      // Start extension packed fields
      var packedFields = this.data.getNext(SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.disposalMethod = this.unpackInteger(packedFieldsInt, 3 ,6);
      this.userInputFlag = this.checkBitFlag(packedFieldsInt, 7);
      this.transportColorFlag = this.checkBitFlag(packedFieldsInt, 8);
        // End extension packed fields

      this.delayTime = this.data.getNext(SIZES.UNSIGNED);
      this.transparentColorIndex = this.data.getNext(SIZES.BYTE);
      this.blockTerminator = this.data.getNext(SIZES.BYTE);

      this.explain.graphicsControlExtension();
    },
    comment: () => {
      this.commentExtensionIntroduction = this.data.getNext(SIZES.BYTE);
      this.commentLabel = this.data.getNext(SIZES.BYTE);
      this.blockTerminator = this.data.getNext(SIZES.BYTE);
      this.explain.comment();
    },
    imageData: () => {
      this.LZWMinimumCodeSize = this.data.getNext(SIZES.BYTE);
      this.explain.imageData();
    }
  };
  
  this.explain = {
    header: () => {
      console.log("Signature:\t\t\t",this.signature.toString(),"\t\t(Fixed value)");
	    console.log("Version:\t\t\t",CONSTANTS.VERSIONS[this.version.toString()],"\t(87a or 89a)");
	  },
    logicalScreenDescriptor: () => {
      console.log("Logical Screen Width:\t\t", this.logicalScreenWidth,"\t\t(pixels)");
      console.log("Logical Screen Height:\t\t", this.logicalScreenHeight,"\t\t(pixels)");
      console.log("Global Color Table Flag:\t",this.globalColorTableFlag.toString(), "\t\t" + (this.globalColorTableFlag ? "(Global Color Table will immediately follow)" : "(No Global Color Table follows)" ));
      console.log("Color Resolution:\t\t", this.colorResolution, "\t\t(" + (this.colorResolution + 1) + " bits available per primary color)");
      console.log("GCT Sort Flag:\t\t\t", this.globalColorTableSortFlag, "\t\t" + (this.globalColorTableSortFlag ? "(Global Color Table ordered by decreasing importance, most important color first)" : "(Global Color Table not ordered)"));
      console.log("GCT Size:\t\t\t", this.globalColorTableSizeRaw, "\t\t(" + this.globalColorTableSize + " colors, 2^(GCTSIZE+1))");
      console.log("Background Color Index:\t\t", this.backgroundColorIndex,"\t\t(Index of background color in Global Color Table)");
      console.log("Pixel Aspect Ratio:\t\t", this.pixelAspectRatio, "\t\t" + (this.pixelAspectRatio == 0 ? "(No aspect ratio information is given)" : "(Aspect Ratio = (Pixel Aspect Ratio + 15) / 64)"));
    },
    globalColorTable: () => {
      //console.log(this.colors.length + " Colors");
      console.log(this.colors.length + " Colors:")
      _.each(this.colors, (color, index) => {
        console.log("[" + index + "] " + color.toString())
      })
    },
    graphicsControlExtension: () => {
      console.log(BREAK, "Extension Block", BREAK);
      console.log("Extension Introducer:\t\t", this.extensionBlock.toInt().toString(16),"\t\t(Fixed 0x21)");
      console.log("Graphic Control Label:\t\t", this.graphicControlLabel.toInt().toString(16),"\t\t(Fixed 0xF9)");
      console.log("Block Size:\t\t\t", this.blockSize.toInt(), "[dec]");
      console.log("Disposal Method:\t\t", this.disposalMethod);
      console.log("User Input Flag:\t\t", this.userInputFlag);
      console.log("Transport Color Flag:\t\t", this.transportColorFlag);
      console.log("Delay Time:\t\t\t", this.delayTime.toInt());
      console.log("Transparent Color Index:\t", this.transparentColorIndex.toInt().toString(16));
      console.log("Block Terminator:\t\t", this.blockTerminator.toInt().toString(16));
    },
    imageDescriptor: () => {
      console.log(BREAK,"Image Descriptor",BREAK);
      console.log("Image Separator:\t\t", this.imageSeparator.toInt().toString(16), "(Fixed 0x2C)");
      console.log("Image Left Position:\t\t", this.imageLeftPosition.toInt());
      console.log("Image Top Position:\t\t", this.imageTopPosition.toInt());
      console.log("Image Width:\t\t\t", this.imageWidth.buffer.readUInt16LE());
      console.log("Image Height:\t\t\t", this.imageHeight.buffer.readUInt16LE());
    },
    localColorTable: () => {
      console.log(BREAK,"Local Color Table",BREAK);
      console.log("LCT Flag:\t\t\t", this.localColorTableFlag);
      console.log("LCT Interlace Flag:\t\t", this.localColorTableInterlaceFlag);
      console.log("LCT Sort Flag:\t\t\t", this.localColorTableSortFlag);
      console.log("LCT Size:\t\t\t", this.localColorTableSize);
    },
    comment: () => {
    },
    imageData: () => {
      console.log("LZW Minimum Code Size:\t", this.LZWMinimumCodeSize.toInt(),"\t(Initial number of bits used for LZW codes in the image data)");
    }
  };
  
  this.read = (data) => {
    this.data = new LinearBuffer(data);
	
	  while(this.data.position < this.data.getLength()) {
      if(this.data.position === 0) {
        this.parse.header();
        this.parse.logicalScreenDescriptor();

        if(this.globalColorTableFlag) {
          this.parse.globalColorTable();
        }
      }

      var nextByte = this.data.peekNext(SIZES.BYTE).toInt().toString(16);

      switch(nextByte) {
        case CONSTANTS.BLOCKS.GRAPHICS_CONTROL_EXTENSION:
          this.parse.graphicsControlExtension();
          break;
        case CONSTANTS.BLOCKS.IMAGE_DESCRIPTOR:
          this.parse.imageDescriptor();
          if(this.localColorTableFlag) {
            this.parse.localColorTable();
          }
          break;
        case CONSTANTS.BLOCKS.COMMENT_EXTENSION:
          this.parse.comment();
          break;
        default:
          console.log("Next byte:", nextByte);
          return;
      }
    }

    this.parse.imageData();

    //For debug purposes
    this.next = this.data.getNext(24);
    console.log(this.next.toString('hex'));
  };
  return this;
}();

var readStream = fs.readFile(filename, (err, data) => {
  console.log(BREAK,"Reading", filename, BREAK);
  if(err) { console.log(err); }
  image.read(data);
});