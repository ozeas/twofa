const promisify = func => (...args) =>
  new Promise((resolve, reject) =>
    func(...args, (err, result) => (err ? reject(err) : resolve(result)))
  );

const Conf = require('conf');
const jimpRead = promisify(require('jimp').read);
const jsQR = require('jsqr');
const fs = require('fs');
const OTPAuth = require('otpauth');
const qrcode = require('qrcode-terminal');
const screencapture = promisify(require('screencapture'));

class TwoFA {
  constructor() {
    this.store = new Conf(this);
    this.screencap = screencapture;
  }

  add(service, options) {
    options = options || {};

    if (this._storeExists(service)) {
      return Promise.reject(`A service with name '${service}' already exists.`);
    }

    const promise = options.imagePath ?
      this._readQRCode(options.imagePath) : this._captureAndReadQRCode() ;

    return promise
      .then(uri => OTPAuth.URI.parse(uri))
      .then(otpauth => this.store.set(service, otpauth.toString()))
      .then(() => this.gen(service));
  }

  del(service) {
    return this._storeDel(service);
  }

  gen(service) {
    if (!service) {
      return this._genAll();
    }

    return this._storeGet(service)
      .then(uri => OTPAuth.URI.parse(uri))
      .then(otpauth => ({
        code: otpauth.generate(),
        label: otpauth.label,
        service: service,
      }));
  }

  qrcode(service) {
    return this._storeGet(service)
      .then(uri => {
        return new Promise(resolve =>
          qrcode.generate(uri, { small: true }, qrcode => resolve(qrcode))
        )
      });
  }

  _captureAndReadQRCode() {
    return this.screencap()
      .then(imagePath => {
        this.lastQRCode = imagePath;
        return imagePath;
      })
      .then(image => this._readQRCode(image))
      .catch((e) => {
        const error = e instanceof Object ?
          'The image capture failed or user canceled.' : e;

        return Promise.reject(error);
      });
  }

  _genAll() {
    const services = Object.keys(this.store.get() || {});

    const codes = [];
    services.forEach(service => {
      codes.push(this.gen(service));
    });

    return Promise.all(codes);
  }

  _readQRCode(imagePath) {
    const buffer = fs.readFileSync(imagePath);

    return jimpRead(buffer)
      .then(image => {
        const bitmap = image.bitmap
        const code = jsQR(bitmap.data, bitmap.width, bitmap.height) || {};

        if (!{}.hasOwnProperty.call(code, 'data')) {
          return Promise.reject('Invalid qrcode image. Try again.');
        }

        return code.data;
      });
  }

  _storeDel(service) {
    return this._storeGet(service)
      .then(() => this.store.delete(service));
  }

  _storeExists(service) {
    return !!this.store.get(service);
  }

  _storeGet(service) {
    const value = this.store.get(service);

    if (!value) {
      return Promise.reject(`A service with name '${service}' not exists.`);
    }

    return Promise.resolve(value);
  }
}

module.exports = TwoFA;