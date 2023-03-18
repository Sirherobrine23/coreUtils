import { createRoute } from "../src/index.js";
const app = createRoute();

app.get("__route", function ({res}) {
  res.json(this.route_registred);
});

app.get("/", (_req, _res, next) => next(), ({res, req}) => res.json({
  from: "next",
  ip: req.ip,
  port: req.port,
  family: req.socket.remoteFamily,
  local: {
    port: req.socket.localPort,
    addr: req.socket.localAddress
  }
}));

app.all("/body", (req, res, next) => req.method !== "GET" ? next() : res.status(400).json({error: "methods with Body only"}), ({res, req}) => res.json({
  body: req.body
}));

const app2 = createRoute();
app.use("/main", app2);
app2.get("/", (req) => {req.res.json({ok: true})});
app2.get("/throw", () => {throw new Error("test 1")});
app2.get("/throw2", async () => {throw new Error("test 2")});

const app3 = createRoute();
app2.use(app3);
app2.use("/:google", app3);
app3.get("/bing", (req, res) => {
  res.json({
    ok: "Bing from app3",
    parms: req.params
  });
});

app.all("*", (req, res) => {
  return res.json({
    method: req.method,
    path: req.path,
    protocol: req.protocol,
    error: "Page not exist"
  });
});

app.on("listen", console.log);
app.listen("http", 3000);