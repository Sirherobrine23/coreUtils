export type regionLocation = "af-johannesburg-1"|"ap-chuncheon-1"|"ap-hyderabad-1"|"ap-melbourne-1"|"ap-mumbai-1"|"ap-osaka-1"|"ap-seoul-1"|"ap-singapore-1"|"ap-sydney-1"|"ap-tokyo-1"|"ca-montreal-1"|"ca-toronto-1"|"eu-amsterdam-1"|"eu-frankfurt-1"|"eu-madrid-1"|"eu-marseille-1"|"eu-milan-1"|"eu-paris-1"|"eu-stockholm-1"|"eu-zurich-1"|"il-jerusalem-1"|"me-abudhabi-1"|"me-jeddah-1"|"mx-queretaro-1"|"sa-santiago-1"|"sa-saopaulo-1"|"sa-vinhedo-1"|"uk-cardiff-1"|"uk-london-1"|"us-ashburn-1"|"us-chicago-1"|"us-phoenix-1"|"us-sanjose-1";
const regionsArray: regionLocation[] = [
  "af-johannesburg-1",
  "ap-chuncheon-1",
  "ap-hyderabad-1",
  "ap-melbourne-1",
  "ap-mumbai-1",
  "ap-osaka-1",
  "ap-seoul-1",
  "ap-singapore-1",
  "ap-sydney-1",
  "ap-tokyo-1",
  "ca-montreal-1",
  "ca-toronto-1",
  "eu-amsterdam-1",
  "eu-frankfurt-1",
  "eu-madrid-1",
  "eu-marseille-1",
  "eu-milan-1",
  "eu-paris-1",
  "eu-stockholm-1",
  "eu-zurich-1",
  "il-jerusalem-1",
  "me-abudhabi-1",
  "me-jeddah-1",
  "mx-queretaro-1",
  "sa-santiago-1",
  "sa-saopaulo-1",
  "sa-vinhedo-1",
  "uk-cardiff-1",
  "uk-london-1",
  "us-ashburn-1",
  "us-chicago-1",
  "us-phoenix-1",
  "us-sanjose-1"
];

export type regionObject = Awaited<ReturnType<typeof endpoint>>;
export default endpoint;
export function endpoint(region: regionLocation) {
  if (!regionsArray.includes(region)) throw new Error("Invalid region");
  return {
    region,
    object_storage: `https://objectstorage.${region}.oraclecloud.com`,
  };
}

export class authKey {
  constructor(
    private tenancy: string,
    private user: string,
    private fingerprint: string,
    private privateKey: string,
    private passphrase?: string,
    private region?: regionLocation|regionObject,
  ) {}

  public getPrivateKey() {
    if (Buffer.isBuffer(this.privateKey)) return this.privateKey.toString();
    return this.privateKey;
  }

  public async getKeyId(): Promise<string> {
    return this.tenancy + "/" + this.user + "/" + this.fingerprint;
  }

  public getRegion() {
    if (this.region) return typeof this.region === "string" ? this.region : this.region.region;
    return null;
  }

  public getPassphrase() {
    return this.passphrase;
  }

  public genAutorizationHeader() {

  }
}