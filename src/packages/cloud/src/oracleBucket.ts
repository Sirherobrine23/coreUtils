import * as ociBucket from "oci-objectstorage";
import * as ociAuth from "oci-common";
import stream from "node:stream";
export type oracleRegions = "af-johannesburg-1"|"ap-chuncheon-1"|"ap-hyderabad-1"|"ap-melbourne-1"|"ap-mumbai-1"|"ap-osaka-1"|"ap-seoul-1"|"ap-singapore-1"|"ap-sydney-1"|"ap-tokyo-1"|"ca-montreal-1"|"ca-toronto-1"|"eu-amsterdam-1"|"eu-frankfurt-1"|"eu-madrid-1"|"eu-marseille-1"|"eu-milan-1"|"eu-paris-1"|"eu-stockholm-1"|"eu-zurich-1"|"il-jerusalem-1"|"me-abudhabi-1"|"me-jeddah-1"|"mx-queretaro-1"|"sa-santiago-1"|"sa-saopaulo-1"|"sa-vinhedo-1"|"uk-cardiff-1"|"uk-london-1"|"us-ashburn-1"|"us-chicago-1"|"us-phoenix-1"|"us-sanjose-1";
export type mangerOptions = {
  region: oracleRegions,
  namespace: string,
  name: string,
  auth: {
    type: "user"
    tenancy: string,
    user: string,
    fingerprint: string,
    privateKey: string,
    passphase?: string,
  }|{
    type: "preAuthentication",
    PreAuthenticatedKey: string,
    name: string,
  }
}

function getRegion(region: oracleRegions) {
  if (region === "uk-london-1") return ociAuth.Region.UK_LONDON_1;
  else if (region === "uk-cardiff-1") return ociAuth.Region.UK_CARDIFF_1;
  else if (region === "sa-santiago-1") return ociAuth.Region.SA_SANTIAGO_1;
  else if (region === "sa-saopaulo-1") return ociAuth.Region.SA_SAOPAULO_1;
  else if (region === "sa-vinhedo-1") return ociAuth.Region.SA_VINHEDO_1;
  else if (region === "mx-queretaro-1") return ociAuth.Region.MX_QUERETARO_1;
  else if (region === "me-jeddah-1") return ociAuth.Region.ME_JEDDAH_1;
  else if (region === "me-abudhabi-1") return ociAuth.Region.ME_ABUDHABI_1;
  else if (region === "il-jerusalem-1") return ociAuth.Region.IL_JERUSALEM_1;
  else if (region === "eu-zurich-1") return ociAuth.Region.EU_ZURICH_1;
  else if (region === "eu-stockholm-1") return ociAuth.Region.EU_STOCKHOLM_1;
  else if (region === "eu-paris-1") return ociAuth.Region.EU_PARIS_1;
  else if (region === "eu-milan-1") return ociAuth.Region.EU_MILAN_1;
  else if (region === "eu-marseille-1") return ociAuth.Region.EU_MARSEILLE_1;
  else if (region === "eu-madrid-1") return ociAuth.Region.EU_MADRID_1;
  else if (region === "eu-frankfurt-1") return ociAuth.Region.EU_FRANKFURT_1;
  else if (region === "eu-amsterdam-1") return ociAuth.Region.EU_AMSTERDAM_1;
  else if (region === "ca-toronto-1") return ociAuth.Region.CA_TORONTO_1;
  else if (region === "ca-montreal-1") return ociAuth.Region.CA_MONTREAL_1;
  else if (region === "ap-tokyo-1") return ociAuth.Region.AP_TOKYO_1;
  else if (region === "ap-sydney-1") return ociAuth.Region.AP_SYDNEY_1;
  else if (region === "ap-singapore-1") return ociAuth.Region.AP_SINGAPORE_1;
  else if (region === "ap-seoul-1") return ociAuth.Region.AP_SEOUL_1;
  else if (region === "ap-osaka-1") return ociAuth.Region.AP_OSAKA_1;
  else if (region === "ap-mumbai-1") return ociAuth.Region.AP_MUMBAI_1;
  else if (region === "ap-melbourne-1") return ociAuth.Region.AP_MELBOURNE_1;
  else if (region === "ap-hyderabad-1") return ociAuth.Region.AP_HYDERABAD_1;
  else if (region === "ap-chuncheon-1") return ociAuth.Region.AP_CHUNCHEON_1;
  else if (region === "af-johannesburg-1") return ociAuth.Region.AF_JOHANNESBURG_1;
  else if (region === "us-sanjose-1") return ociAuth.Region.US_SANJOSE_1;
  else if (region === "us-phoenix-1") return ociAuth.Region.US_PHOENIX_1;
  else if (region === "us-chicago-1") return ociAuth.Region.US_CHICAGO_1;
  else if (region === "us-ashburn-1") return ociAuth.Region.US_ASHBURN_1;
  else throw new Error("Invalid region");
}

/**
 * Create object with functions to manage files in Oracle cloud bucket
 */
export async function oracleBucket(config: mangerOptions) {
  const client = new ociBucket.ObjectStorageClient({
    authenticationDetailsProvider: config.auth.type === "preAuthentication" ? null : new ociAuth.SimpleAuthenticationDetailsProvider(
      config.auth.tenancy,
      config.auth.user,
      config.auth.fingerprint,
      config.auth.privateKey,
      config.auth.passphase||null,
      getRegion(config.region)
    )
  });
  if (config.auth.type === "preAuthentication") {
    // await client.createPreauthenticatedRequest({
    //   bucketName: config.name,
    //   namespaceName: config.namespace,
    //   createPreauthenticatedRequestDetails: {
    //     accessType: ociBucket.models.CreatePreauthenticatedRequestDetails.AccessType.AnyObjectReadWrite,
    //     timeExpires
    //   }
    // })
  }
  async function uploadFile(fileName: string, fileStream: string|Buffer|stream.Readable) {
    await client.putObject({
      namespaceName: config.namespace,
      bucketName: config.name,
      objectName: fileName,
      putObjectBody: fileStream,
    });
  }

  async function deleteFile(pathLocation: string) {
    await client.deleteObject({
      namespaceName: config.namespace,
      bucketName: config.name,
      objectName: pathLocation
    });
  }

  async function listFiles(folder?: string) {
    const objects: ociBucket.models.ObjectSummary[] = [];
    let start: any;
    while (true) {
      const { listObjects } = await client.listObjects({
        namespaceName: config.namespace,
        bucketName: config.name,
        fields: "name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState" as any,
        prefix: folder,
        start
      });
      objects.push(...listObjects.objects);
      if (!(start = listObjects.nextStartWith)) break;
    }

    return objects.map(data => ({
      path: data.name,
      size: Number(data.size||0),
      state: data.archivalState,
      tier: data.storageTier,
      md5: data.md5,
      getFileStream: () => getFileStream(data.name),
      dates: {
        created: new Date(data.timeCreated),
        modified: new Date(data.timeModified),
      }
    }));
  }

  async function getFileStream(pathLocation: string) {
    const { value } = await client.getObject({
      namespaceName: config.namespace,
      bucketName: config.name,
      objectName: pathLocation,
    });
    if (!value) throw new Error("No file found");
    else if (value instanceof stream.Readable) return value;
    else return stream.Readable.fromWeb(value as any);
  }

  return {
    uploadFile,
    deleteFile,
    listFiles,
    getFileStream,
  };
}