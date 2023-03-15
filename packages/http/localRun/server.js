import { createRoute } from "../src/server.js";
const app = createRoute();
app.get("/", (req, res, next) => {
    res.json({
        head: req.headers,
        path: req.path,
        next: typeof next
    });
});
app.get("/:id/:id2", (req, res, next) => {
    req["test"] = "Hello from object inject";
    if (req.query.throw)
        throw new Error(req.query.throw);
    return next();
}, (req, res) => {
    res.json({
        testText: req["test"],
        path: req.path,
        parms: req.params,
        query: req.query,
        head: req.headers,
    });
});
app.listen("http", 3000, () => console.log("Listen on 3000"));
