const fs = require("fs");
const key = fs.readFileSync("./local-chef-bazar-e4a60-firebase-adminsdk-fbsvc-b647b27705.json", "utf8");
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
