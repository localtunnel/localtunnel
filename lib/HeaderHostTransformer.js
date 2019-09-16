const { Transform } = require('stream');

class HeaderHostTransformer extends Transform {
  constructor(opts = {}) {
    super(opts);
    this.host = opts.host || 'localhost';
    this.replaced = false;
  }

  _transform(data, encoding, callback) {
    callback(
      null,
      this.replaced // after replacing the first instance of the Host header we just become a regular passthrough
        ? data
        : data.toString().replace(/(\r\n[Hh]ost: )\S+/, (match, $1) => {
            this.replaced = true;
            return $1 + this.host;
          })
    );
  }
}

module.exports = HeaderHostTransformer;
