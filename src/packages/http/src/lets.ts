import { createServer } from "node:http";
import * as http from "./main.js";
import cloudflare from "cloudflare";
import acmeClient from "acme-client";

export type automazation = {
  type: "cloudflare",
  zoneID: string,
  email?: string,
  key?: string,
  token?: string,
}

export async function createSSLCertificate(email: string, domains: string[], automatic?: automazation) {
  const client = new acmeClient.Client({
    accountKey: await acmeClient.crypto.createPrivateKey(),
    directoryUrl: acmeClient.directory.letsencrypt.production,
  });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`]
  });

  const [key, csr] = await acmeClient.crypto.createCsr({
    commonName: domains[0],
    altNames: domains.slice(1)
  });
  let close: () => void;
  const cert = await client.auto({
    termsOfServiceAgreed: true,
    email: `mailto:${email}`,
    challengePriority: ["dns-01"],
    csr,
    async challengeCreateFn(authz, challenge, keyAuthorization) {
      if (challenge.type === "dns-01") {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        if (automatic) {
          if (automatic.type === "cloudflare") {
            const cf = new cloudflare({email: automatic.email, key: automatic.key, token: automatic.token});
            await cf.dnsRecords.add(automatic.zoneID, {
              type: "TXT",
              name: dnsRecord,
              content: keyAuthorization,
              ttl: 0
            });
            console.log("Created TXT record %O with value %O, waiting to propagate", dnsRecord, keyAuthorization);
            return;
          }
        }
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
      if (automatic.type === "cloudflare") {
        const cf = new cloudflare({email: automatic.email, key: automatic.key, token: automatic.token});
        const records = await cf.dnsRecords.browse(automatic.zoneID) as any as {result: {id: string, name: string, type: string}[]};
        const id = records?.result?.find(a => a.name === dnsRecord && a.type === "TXT")?.id
        if (id) {
          await cf.dnsRecords.del(automatic.zoneID, id);
          console.log("Removed TXT record %O with value %O", dnsRecord, keyAuthorization);
          return;
        }
        console.log("Could not find TXT record %O with value %O", dnsRecord, keyAuthorization);
        return;
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