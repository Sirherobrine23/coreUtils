# Nodejs Debian maneger

this package supports some features that can be useful like extracting the Package files or even creating a Nodejs direct

## Supported features

### Dpkg

- Create package.
- Extract package file (`ar` file).
- Extract and descompress `data.tar`.

### Apt

- Get packages from repository `Packages` file.
- Parse repository `source.list`.
- Parse `Release` and `InRelease` file.

## Examples

É possivel criar pacotes direto de pacote:

```ts
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { finished } from "node:stream/promises";
import path from "node:path";
import dpkg from "@sirherobrine23/debian";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const deb = dpkg.createPackage({
  dataFolder: path.join(__dirname, "debian_pack"),
  control: {
    Package: "test",
    Architecture: "all",
    Version: "1.1.1",
    Description: `Example to create fist line\n\nand Second`,
    Maintainer: {
      Name: "Matheus Sampaio Queiroga",
      Email: "srherobrine20@gmail.com"
    }
  },
  compress: {
    data: "gzip",
    control: "gzip",
  },
  scripts: {
    preinst: "#!/bin/bash\nset -ex\necho OK"
  }
});
await finished(deb.pipe(createWriteStream(path.join(__dirname, "example.deb"))));
```