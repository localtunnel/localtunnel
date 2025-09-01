import { Transform } from "node:stream";

type HeaderHostTransformerOptions = {
  host?: string
}

export default class HeaderHostTransformer extends Transform {
  
  private host: string
  private replaced: boolean

  constructor(opts: HeaderHostTransformerOptions = {}) {
    super();
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
