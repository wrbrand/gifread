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

var file = () => {
  this.data = undefined;
  this.header = {
    signature: undefined,
    version: undefined
  };
  this.logicalScreen = {
    width: undefined,
    height: undefined
  };
  this.globalColorTable = {
    data: undefined,
    flag: undefined,
    sorted: undefined,
    size: undefined,
    colors: []    // Indexes should be maintained
  };
  this.extensions = [ ];
  this.images = [   // Potentially many, each with an Image Descriptor, (optional) Local Color Table, and Image Data
    /*{
      descriptor: { // Image descriptor block

      },
      lct: {        // Local color table
        flag: undefined,
        interlaced: undefined,
        sorted: undefined,
        colors: []  // Indexes should be maintained, type Color
      },
      data: {
        LZWMinimumCodeSize: undefined
        blocks: []  // Image data sub-blocks
      }
    }*/
  ];

  this.read = (data) => {
    this.data = new types.LinearBuffer(data);

    while(this.data.position < this.data.getLength()) {
      if(this.data.position === 0) {
        this.parse.header();
        this.parse.logicalScreenDescriptor();
      }

      var nextByte = this.data.peekNext(helpers.constants.SIZES.BYTE).toInt().toString(16);

      switch(nextByte) {
        case helpers.constants.BLOCKS.GRAPHICS_CONTROL_EXTENSION:
          this.parse.graphicsControlExtension();
          break;
        case helpers.constants.BLOCKS.IMAGE_DESCRIPTOR:
          this.parse.image();
          break;
        case helpers.constants.BLOCKS.COMMENT_EXTENSION:
          this.parse.comment();
          break;
        case helpers.constants.BLOCKS.TRAILER:
          this.parse.trailer();
          break;
        default:
          this.next = this.data.getNext(24);
          console.log("Next bytes:", this.next.toString('hex'));
          return;
      }
    }
    //For debug purposes
    this.next = this.data.getNext(24);
    console.log(this.next.toString('hex'));
  };

  this.parse = {
    header: () => {
      this.header.signature = this.data.getNext(helpers.constants.SIZES.SIGNATURE);
      helpers.insist(this.header.signature.toString() === helpers.constants.GIF_SIGNATURE, "Not a valid GIF: GIF signature not present");

      this.header.version = this.data.getNext(helpers.constants.SIZES.VERSION);
      helpers.insist(typeof helpers.constants.VERSIONS[this.header.version.toString()] !== "undefined", "Not a valid GIF: Version must be 87a or 89a, got " + this.header.version.toString());

      this.explain.header();
    },
    logicalScreenDescriptor: () => {
      this.logicalScreen.width = this.data.getNext(helpers.constants.SIZES.UNSIGNED).buffer.readInt16LE();
      this.logicalScreen.height = this.data.getNext(helpers.constants.SIZES.UNSIGNED).buffer.readInt16LE();

      // Start packed GCT fields

      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      this.globalColorTable.flag = helpers.checkBitFlag(packedFieldsInt, 1);
      this.logicalScreen.colorResolution = helpers.unpackInteger(packedFieldsInt, 2, 4);
      this.globalColorTable.sorted = helpers.checkBitFlag(packedFieldsInt, 5);

      // Per spec, the GCT size is stored in the 3 least significant bits of the packed fields: "To determine [the] actual size of the color table, raise 2 to [the value of the field + 1]"
      this.globalColorTable.sizeRaw = helpers.unpackInteger(packedFieldsInt, 5, 8);
      this.globalColorTable.size = Math.pow(2, (helpers.unpackInteger(packedFieldsInt, 5, 8) + 1));

        // End packed GCT fields

      this.logicalScreen.backgroundColorIndex = this.data.getNext(helpers.constants.SIZES.BYTE).toInt();
      this.logicalScreen.pixelAspectRatio = this.data.getNext(helpers.constants.SIZES.BYTE).toInt();

      this.globalColorTable.colors = this.parse.colorTable(this.globalColorTable.size);

      this.explain.logicalScreenDescriptor()
    },
    colorTable: (size) => {
      var colorData = this.data.getNext(helpers.constants.SIZES.COLOR * size);
      var colors = [];
      colorData.forEvery(helpers.constants.SIZES.COLOR, (colorBuffer) => {
          colors.push(new types.Color(colorBuffer));
      });
      return colors
    },
    image: () => {
      var descriptor = {
        separator: this.data.getNext(helpers.constants.SIZES.BYTE),
        left: this.data.getNext(helpers.constants.SIZES.UNSIGNED),
        top: this.data.getNext(helpers.constants.SIZES.UNSIGNED),
        width: this.data.getNext(helpers.constants.SIZES.UNSIGNED),
        height: this.data.getNext(helpers.constants.SIZES.UNSIGNED)
      };

      // Start packed image descriptor fields
      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();

      var lct = {        // Local color table
        flag: helpers.checkBitFlag(packedFieldsInt, 1),
        interlaced: helpers.unpackInteger(packedFieldsInt, 2, 4),
        sorted: helpers.checkBitFlag(packedFieldsInt, 5),
        size: helpers.unpackInteger(packedFieldsInt, 5, 8)
      };
      // End packed image descriptor fields

      if(lct.flag) {
        lct.colors = this.parse.colorTable(lct.size)
      }

      var imageData = this.parse.imageData();

      var index = this.images.push({
        descriptor: descriptor,
        lct: lct,
        data: imageData
      }) - 1;

      this.explain.image(index)
    },
    imageData: () => {
      var imageData = {
        LZWMinimumCodeSize: this.data.getNext(helpers.constants.SIZES.BYTE),
        blocks: [],
        terminator: undefined // Literally a reference to the terminating byte
      };

      while(this.data.peekNext(helpers.constants.SIZES.BYTE).toInt() !== 0) {
        var block = {
          size: undefined,
          data: undefined
        };

        block.size = this.data.getNext(helpers.constants.SIZES.BYTE).toInt();
        block.data = this.data.getNext(block.size);

        imageData.blocks.push(block);
      }

      imageData.terminator = this.data.getNext(helpers.constants.SIZES.BYTE);

      return imageData;
    },
    graphicsControlExtension: () => {
      var extension = {
        introducer: undefined,
        label: undefined,
        blockSize: undefined,
        disposalMethod: undefined,
        userInputFlag: undefined,
        transportColorFlag: undefined,
        delayTime: undefined,
        transparentColorIndex: undefined,
        blockTerminator: undefined
      };

      extension.introducer = this.data.getNext(helpers.constants.SIZES.BYTE);
      extension.label = this.data.getNext(helpers.constants.SIZES.BYTE);
      extension.blockSize = this.data.getNext(helpers.constants.SIZES.BYTE);

      // Start extension packed fields
      var packedFields = this.data.getNext(helpers.constants.SIZES.BYTE);
      var packedFieldsInt = packedFields.toInt();
      extension.disposalMethod = helpers.unpackInteger(packedFieldsInt, 3 ,6);
      extension.userInputFlag = helpers.checkBitFlag(packedFieldsInt, 7);
      extension.transportColorFlag = helpers.checkBitFlag(packedFieldsInt, 8);
        // End extension packed fields

      extension.delayTime = this.data.getNext(helpers.constants.SIZES.UNSIGNED);
      extension.transparentColorIndex = this.data.getNext(helpers.constants.SIZES.BYTE);
      extension.blockTerminator = this.data.getNext(helpers.constants.SIZES.BYTE);

      var index = this.extensions.push(extension) - 1;
      this.explain.graphicsControlExtension(index);
    },
    comment: () => {
      this.commentExtensionIntroduction = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.commentLabel = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.blockTerminator = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.explain.comment();
    },
    trailer: () => {
      this.trailer = this.data.getNext(helpers.constants.SIZES.BYTE);
      this.explain.trailer();
    }
  };
  
  this.explain = {
    header: () => {
      console.log("Signature:\t\t\t", this.header.signature.toString(),"\t\t(Fixed value)");
	    console.log("Version:\t\t\t", helpers.constants.VERSIONS[this.header.version.toString()],"\t(87a or 89a)");
	  },
    logicalScreenDescriptor: () => {
      console.log(helpers.constants.BREAK, "Logical Screen Descriptor", helpers.constants.BREAK);

      console.log("Logical Screen Width:\t\t", this.logicalScreen.width,"\t\t(pixels)");
      console.log("Logical Screen Height:\t\t", this.logicalScreen.height,"\t\t(pixels)");
      console.log("Global Color Table Flag:\t",this.globalColorTable.flag.toString(), "\t\t" + (this.globalColorTable.flag ? "(Global Color Table will immediately follow)" : "(No Global Color Table follows)" ));
      console.log("Color Resolution:\t\t", this.logicalScreen.colorResolution, "\t\t(" + (this.logicalScreen.colorResolution + 1) + " bits available per primary color)");
      console.log("GCT Sort Flag:\t\t\t", this.globalColorTable.sorted, "\t\t" + (this.globalColorTable.sorted ? "(Global Color Table ordered by decreasing importance, most important color first)" : "(Global Color Table not ordered)"));
      console.log("GCT Size:\t\t\t", this.globalColorTable.sizeRaw, "\t\t(" + this.globalColorTable.size + " colors, 2^(GCTSIZE+1))");
      console.log("Background Color Index:\t\t", this.logicalScreen.backgroundColorIndex,this.globalColorTable.colors[parseInt(this.logicalScreen.backgroundColorIndex, 16)].toString("shortest"),"\t(Index of background color in Global Color Table)");
      console.log("Pixel Aspect Ratio:\t\t", this.logicalScreen.pixelAspectRatio, "\t\t" + (this.logicalScreen.pixelAspectRatio === 0 ? "(No aspect ratio information is given)" : "(Aspect Ratio = (Pixel Aspect Ratio + 15) / 64)"));

      if(this.globalColorTable.flag) {
        console.log(helpers.constants.BREAK,"Global Color Table",helpers.constants.BREAK);
        console.log(this.globalColorTable.colors.length + " Colors:")
        _.each(this.globalColorTable.colors, (color, index) => {
          console.log("[" + index + "] " + color.toString())
        })
      }
    },
    graphicsControlExtension: (index) => {
      var extension = this.extensions[index];

      console.log(helpers.constants.BREAK, "Extension Block", helpers.constants.BREAK);
      console.log("Extension Introducer:\t\t", extension.introducer.toInt().toString(16),"\t\t(Fixed 0x21)");
      console.log("Graphic Control Label:\t\t", extension.label.toInt().toString(16),"\t\t(Fixed 0xF9)");
      console.log("Block Size:\t\t\t", extension.blockSize.toInt(), "[dec]");
      console.log("Disposal Method:\t\t", extension.disposalMethod);
      console.log("User Input Flag:\t\t", extension.userInputFlag);
      console.log("Transport Color Flag:\t\t", extension.transportColorFlag);
      console.log("Delay Time:\t\t\t", extension.delayTime.toInt());
      console.log("Transparent Color Index:\t", extension.transparentColorIndex.toInt().toString(16), this.globalColorTable.colors[extension.transparentColorIndex.toInt()].toString("shortest"));
      console.log("Block Terminator:\t\t", extension.blockTerminator.toInt().toString(16));
    },
    image: (index) => {
      var image = this.images[index];

      console.log(helpers.constants.BREAK,"Image Descriptor " + index,helpers.constants.BREAK);
      console.log("Image Separator:\t\t", image.descriptor.separator.toInt().toString(16), "\t(Fixed 0x2C)");
      console.log("Image Left Position:\t\t", image.descriptor.left.toInt());
      console.log("Image Top Position:\t\t", image.descriptor.top.toInt());
      console.log("Image Width:\t\t\t", image.descriptor.width.buffer.readUInt16LE());
      console.log("Image Height:\t\t\t", image.descriptor.height.buffer.readUInt16LE());

      if(image.lct.flag) {
        console.log(helpers.constants.BREAK,"Local Color Table",helpers.constants.BREAK);
        console.log("LCT Flag:\t\t\t", image.lct.flag);
        console.log("LCT Interlace Flag:\t\t", image.lct.interlaced);
        console.log("LCT Sort Flag:\t\t\t", image.lct.sorted);
        console.log("LCT Size:\t\t\t", image.lct.size);
      }

      this.explain.imageData(image);
    },
    imageData: (image) => {
      console.log("LZW Minimum Code Size:\t\t", image.data.LZWMinimumCodeSize.toInt(),"\t(Initial number of bits used for LZW codes in the image data)");
      _.each(image.data.blocks, (block, index) => {
        console.log("Image Data Sub-Block " + index + ": Size " + block.size);
      })
    },
    comment: () => {
    },
    trailer: () => {
      console.log(helpers.constants.BREAK,"Trailer",helpers.constants.BREAK);
      console.log("Trailer:\t\t\t", this.trailer.toInt().toString(16),"\t(Fixed 0x3B)");
      console.log(helpers.constants.BREAK,"End of File Reached",helpers.constants.BREAK);

    }
  };

  return this;
}();

var readStream = fs.readFile(filename, (err, data) => {
  console.log(helpers.constants.BREAK,"Reading", filename, helpers.constants.BREAK);
  if(err) { console.log(err); }
  file.read(data);
});