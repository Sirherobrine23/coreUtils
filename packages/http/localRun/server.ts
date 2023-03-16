import { createRoute } from "../src/server.js";
const app = createRoute();

app.get("__route", function ({res}) {
  res.json(this.route_registred);
});

app.all("*", (req, res, next) => {
  return res.json({
    method: req.method,
    path: req.path,
    protocol: req.protocol,
    head: req.headers,
  });
});

app.listen("http", 3000, () => console.log("Listen on 3000"));