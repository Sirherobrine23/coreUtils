import { createRoute } from "../src/server.js";
const app = createRoute();
app.get("__route", function ({ res }) {
    res.json(this.route_registred);
});
const app2 = createRoute();
app.use("/main", app2);
app2.get("/", (req) => { req.res.json({ ok: true }); });
app2.get("/throw", () => { throw new Error("test 1"); });
app2.get("/throw2", async () => { throw new Error("test 2"); });
const app3 = createRoute();
app2.use(app3);
app2.use("/:google", app3);
app3.get("/bing", (req, res) => {
    res.json({
        ok: "Bing from app3",
        parms: req.params
    });
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
