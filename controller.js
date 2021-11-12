'use strict';

const fs = require('fs');
const path = require('path');

const ini = require('ini');
const jsnes = require('jsnes');

class Controller {
  constructor(nes, num) {
    const confFile = ini.parse(
      fs.readFileSync(path.join(__dirname, './keybindings.conf'), 'utf8'));

    this.mapping = confFile[`Player${num}`];
    this.nes = nes;
    this.num = num;
  }

  keyDown(codeStr) {
    for (const key in this.mapping) {
      if (this.mapping[key] === codeStr) {
        this.nes.buttonDown(this.num, jsnes.Controller[`BUTTON_${key.toUpperCase()}`]);
      }
    }
  }

  keyUp(codeStr) {
    for (const key in this.mapping) {
      if (this.mapping[key] === codeStr) {
        this.nes.buttonUp(this.num, jsnes.Controller[`BUTTON_${key.toUpperCase()}`]);
      }
    }
  }
}

module.exports = Controller;
