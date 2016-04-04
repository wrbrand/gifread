"use strict";

if(process.argv.length < 3) {
  console.log("Usage: node gifread.js [filename]");
  process.exit();
} else {
  filename = process.argv[2];
}

var fs = require('fs'),
    _  = require('lodash'),
    helpers = require("./helpers.js"),
    types = require("./types.js"),
	  filename;

var image = () => {
  this.data = undefined;
  this.colors = []; // Should have indexes identical to the colors' indexes in the file's color table
  
  this.parse = {
      header: () => {
      this.signature = this.data.getNext(helpers.constants.SIZES.SIGNATURE);
      helpers.insist(this.signature.toString() === helpers.constants.GIF_SIGNATURE, "Not a valid GIF: GIF signature not present");

      this.version = this.data.getNext(helpers.constants.SIZES.VERSION);
      helpers.insist(typeof helpers.constants.VERSIONS[this.version.toString()] !== "undefined", "Not a valid GIF: Version must be 87a or 89a, got " + this.version.toString());

      this.explain.header();
    },
    logicalScreenDescriptor: () => {
      this.logicalScreenWidth = this.data.getNext(helpers.constants.SIZES.UNSIGNED).buffer.readInt16LE();
      this.logicalScreenHeight = this.data.getNext(helpers.constants.SIZES.UNSIGNED).buffer.readInt16LE();

      // Start packed GCT fields

      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.globalColorTableFlag = helpers.checkBitFlag(packedFieldsInt, 1);
      this.colorResolution = helpers.unpackInteger(packedFieldsInt, 2, 4);
      this.globalColorTableSortFlag = helpers.checkBitFlag(packedFieldsInt, 5);

      // Per spec, the GCT size is stored in the 3 least significant bits of the packed fields: "To determine [the] actual size of the color table, raise 2 to [the value of the field + 1]"
      this.globalColorTableSizeRaw = helpers.unpackInteger(packedFieldsInt, 5, 8);
      this.globalColorTableSize = Math.pow(2, (helpers.unpackInteger(packedFieldsInt, 5, 8) + 1));

        // End packed GCT fields

      this.backgroundColorIndex = this.data.getNext(helpers.constants.SIZES.BYTE).toInt();
      this.pixelAspectRatio = this.data.getNext(helpers.constants.SIZES.BYTE).toInt();

      this.explain.logicalScreenDescriptor()
    },
    globalColorTable: () => {
      this.globalColorTable = this.data.getNext(3 * this.globalColorTableSize);
      this.globalColorTable.forEvery(helpers.constants.SIZES.COLOR, (colorBuffer) => {
          this.colors.push(new types.Color(colorBuffer));
      });
      this.explain.globalColorTable();
    },
    localColorTable: () => {
      console.log("LCT Incomplete; bugs a-comin");
      this.localColorTable = this.data.getNext(3 * this.globalColorTableSize);
      this.localColorTable.forEvery(helpers.constants.SIZES.COLOR, (colorBuffer) => {
        this.colors.push(new types.Color(colorBuffer));
      });
      this.explain.localColorTable();
    },
    imageDescriptor: () => {
      this.imageSeparator = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.imageLeftPosition = this.data.getNext(helpers.constants.SIZES.UNSIGNED);
      this.imageTopPosition = this.data.getNext(helpers.constants.SIZES.UNSIGNED);
      this.imageWidth = this.data.getNext(helpers.constants.SIZES.UNSIGNED);
      this.imageHeight = this.data.getNext(helpers.constants.SIZES.UNSIGNED);

       // Start packed image descriptor fields
      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.localColorTableFlag = helpers.checkBitFlag(packedFieldsInt, 1);
      this.localColorTableInterlaceFlag = helpers.unpackInteger(packedFieldsInt, 2, 4);
      this.localColorTableSortFlag = helpers.checkBitFlag(packedFieldsInt, 5);
      this.localColorTableSize = helpers.unpackInteger(packedFieldsInt, 5, 8);
      // End packed image descriptor fields

      this.explain.imageDescriptor()
    },
    graphicsControlExtension: () => {
      this.extensionBlock = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.graphicControlLabel = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.blockSize = this.data.getNext(helpers.constants.SIZES.BYTE);

      // Start extension packed fields
      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.disposalMethod = helpers.unpackInteger(packedFieldsInt, 3 ,6);
      this.userInputFlag = helpers.checkBitFlag(packedFieldsInt, 7);
      this.transportColorFlag = helpers.checkBitFlag(packedFieldsInt, 8);
        // End extension packed fields

      this.delayTime = this.data.getNext(helpers.constants.SIZES.UNSIGNED);
      this.transparentColorIndex = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.blockTerminator = this.data.getNext(helpers.constants.SIZES.BYTE);

      this.explain.graphicsControlExtension();
    },
    comment: () => {
      this.commentExtensionIntroduction = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.commentLabel = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.blockTerminator = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.explain.comment();
    },
    imageData: () => {
      this.LZWMinimumCodeSize = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.explain.imageData();
    }
  };
  
  this.explain = {
    header: () => {
      console.log("Signature:\t\t\t",this.signature.toString(),"\t\t(Fixed value)");
	    console.log("Version:\t\t\t",helpers.constants.VERSIONS[this.version.toString()],"\t(87a or 89a)");
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
      console.log(helpers.constants.BREAK, "Extension Block", helpers.constants.BREAK);
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
      console.log(helpers.constants.BREAK,"Image Descriptor",helpers.constants.BREAK);
      console.log("Image Separator:\t\t", this.imageSeparator.toInt().toString(16), "(Fixed 0x2C)");
      console.log("Image Left Position:\t\t", this.imageLeftPosition.toInt());
      console.log("Image Top Position:\t\t", this.imageTopPosition.toInt());
      console.log("Image Width:\t\t\t", this.imageWidth.buffer.readUInt16LE());
      console.log("Image Height:\t\t\t", this.imageHeight.buffer.readUInt16LE());
    },
    localColorTable: () => {
      console.log(helpers.constants.BREAK,"Local Color Table",helpers.constants.BREAK);
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
    this.data = new types.LinearBuffer(data);
	
	  while(this.data.position < this.data.getLength()) {
      if(this.data.position === 0) {
        this.parse.header();
        this.parse.logicalScreenDescriptor();

        if(this.globalColorTableFlag) {
          this.parse.globalColorTable();
        }
      }

      var nextByte = this.data.peekNext(helpers.constants.SIZES.BYTE).toInt().toString(16);

      switch(nextByte) {
        case helpers.constants.BLOCKS.GRAPHICS_CONTROL_EXTENSION:
          this.parse.graphicsControlExtension();
          break;
        case helpers.constants.BLOCKS.IMAGE_DESCRIPTOR:
          this.parse.imageDescriptor();
          if(this.localColorTableFlag) {
            this.parse.localColorTable();
          }
          break;
        case helpers.constants.BLOCKS.COMMENT_EXTENSION:
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
  console.log(helpers.constants.BREAK,"Reading", filename, helpers.constants.BREAK);
  if(err) { console.log(err); }
  image.read(data);
});