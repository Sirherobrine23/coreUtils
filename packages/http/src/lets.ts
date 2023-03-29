import { createServer } from "node:http";
import * as http from "./main.js";
import acmeClient from "acme-client";

export async function createSSLCertificate(domains: string[], email?: string, ) {
  if (!domains || !(Array.isArray(domains)) || domains.length === 0) throw new TypeError("domains required and type is are array with one or more domains!");
  const client = new acmeClient.Client({accountKey: await acmeClient.crypto.createPrivateKey(), directoryUrl: acmeClient.directory.letsencrypt.production});
  await client.createAccount({termsOfServiceAgreed: true, contact: email ? [`mailto:${email}`] : undefined});
  const commonName = domains.shift();
  const [key, csr] = await acmeClient.crypto.createCsr({commonName, altNames: domains});
  let close: () => void;
  const cert = await client.auto({
    termsOfServiceAgreed: true,
    email: email ? `mailto:${email}` : undefined,
    challengePriority: ["dns-01"],
    csr,
    async challengeCreateFn(authz, challenge, keyAuthorization) {
      if (challenge.type === "dns-01") {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        console.log("Would create TXT record %O with value %O", dnsRecord, keyAuthorization);
        return;
      }
      const { ipv4, ipv6 } = await http.getExternalIP();
      if (ipv6) console.log("Add AAA (%O) Record for %O", authz.identifier.value, ipv6);
      if (ipv4) console.log("Add A (%O) Record for %O", authz.identifier.value, ipv4);
      const app = createServer((req, res) => {
        if (req.url.startsWith("/.well-known/acme-challenge/")) res.end(keyAuthorization);
        else {
          res.statusCode = 404;
          res.end();
        }
      });
      const server = app.listen(80, () => {
        console.log(`Listening on port 80`);
      });
      close = () => server.close();
    },
    async challengeRemoveFn(authz, challenge, keyAuthorization) {
      const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
      if (close) {
        console.log("Closing server");
        close();
      }
      console.log("Would remove TXT record %O with value %O", dnsRecord, keyAuthorization);
    },
  });

  return {
    csr: csr.toString(),
    key: key.toString(),
    cert: cert.toString()
  };
}