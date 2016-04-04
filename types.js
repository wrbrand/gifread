"use strict";
var helpers = require("./helpers.js");

module.exports = {
  LinearBuffer: function (buffer) {
    helpers.insist(typeof buffer !== "undefined", "Could not initialize buffer. Does file exist?");

    this.buffer = buffer;
    this.position = 0;

    this.getNext = (bytes) => {
      return new module.exports.LinearBuffer(this.buffer.slice(this.position, this.position += bytes))
    };
    this.peekNext = (bytes) => { // Identical, but doesn't change position
      return new module.exports.LinearBuffer(this.buffer.slice(this.position, this.position + bytes))
    };
    this.toString = (encoding) => {
      return this.buffer.toString.call(this.buffer, encoding)
    };
    this.slice = (args) => {
      return this.buffer.slice.call(this.buffer, arguments)
    };
    this.forEvery = (bytelength, callback) => {
      while (this.position + bytelength <= this.buffer.length) {
        callback(this.getNext(bytelength))
      }
    };
    this.toInt = () => {
      return parseInt(this.buffer.toString('hex'), 16)
    };
    this.getLength = () => {
      return this.buffer.length
    };
  },
  Color: function (buffer) {
    this.buffer = buffer;
    this.red = this.buffer.getNext(helpers.constants.SIZES.BYTE).toInt();
    this.green =  this.buffer.getNext(helpers.constants.SIZES.BYTE).toInt();
    this.blue = this.buffer.getNext(helpers.constants.SIZES.BYTE).toInt();
    this.toString = () => {
      return "\tR" + this.red + "\tG" + this.green + "\tB" + this.blue
    }
  }
}
