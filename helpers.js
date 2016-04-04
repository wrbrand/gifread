"use strict";
var _  = require('lodash');
var constants = {
  SIZES: {
    SIGNATURE: 3,
    VERSION: 3,
    COLOR: 3,
    UNSIGNED: 2,
    BYTE: 1
  },
  BREAK: '\n======\n',
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

module.exports = {
  insist: (predicate, error) => {
    if(predicate) {
      return true;
    } else {
      console.log(error);
      process.exit();
    }
  },
  checkBitFlag: (number, bit) => {
    var bitInt = Math.pow(2, 8 - bit);
    return (number & bitInt) === bitInt
  },
  unpackInteger: (number, startBit, endBit) => {
    // Parses from startBit to endBit of number as an n-bit little-endian integer
    var bits = [];
    for(var i = startBit; i <= endBit; i++) {
      bits.unshift(module.exports.checkBitFlag(number, i))
    }

    return _.reduce(bits, (memo, bit, index) => {
      return memo + ((bit ? 1 : 0) * Math.pow(2, index))
    }, 0);
  },
  constants: constants
};