export function parseM3U(fileData: string) {
  fileData = fileData.replace(/\r\n/gm, "\n").replace("#EXTM3U", "").trim();
  const lines = fileData.split(/^#EXT[A-Z]+:/gm).filter(Boolean);
  return lines.map(data => {
    const url = data.split("\n").find(line => line.trim().startsWith("http"))?.trim();
    const channelInfo: Record<string, any> = {};
    const info = data.split("\n")[0]?.trim()?.replace(/^[0-9\-]+\s/, "") ?? "";
    if (!info) return null;
    let latestKey: string;
    info.split(" ").forEach((item) => {
      if (item.includes("=")) {
        const [key, value] = item.split("=");
        channelInfo[key] = value;
        latestKey = key;
      } else {
        channelInfo[latestKey] += " " + item;
      }
    });
    Object.keys(channelInfo).forEach(key => {
      let keyData = channelInfo[key].replace(/"/g, "").trim();
      if (keyData.includes(",")) keyData = keyData.split(",");
      if (!keyData) delete channelInfo[key];
      else channelInfo[key] = keyData;
    });

    return {
      URL: new URL(url),
      url: url,
      channelInfo
    };
  }).filter(Boolean);
}