const express = require("express");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");



const cors = require("cors");
const app = express();
require("dotenv").config();
// midle ware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fdcjmvl.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});
async function run() {
    try {
        await client.connect();

        const db = client.db("local-chef-bazar");
        const usersCollection = db.collection("users");
        const requestsCollection = db.collection("requests");

        // ------------------Users API------------------
        app.post("/users", async (req, res) => {
            const user = req.body;
            user.role = "user";
            user.createdAt = new Date();
            user.status = "active";
            const email = user.email;

            const userExists = await usersCollection.findOne({ email });
            if (userExists) {
                return res.send({ message: "user exists" });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        // role based access
        app.get("/users/:email/role", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role });
        });

        // showing users on my profile page on frontend
        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            if (!user) return res.status(404).send({ error: "User not found" });
            res.send(user);
        });
        // ------------------request api------------------
         app.post("/requests", async (req, res) => {
             const request = req.body;
             request.requestStatus = "pending";
             request.requestTime = new Date();
             const result = await requestsCollection.insertOne(request);
             res.send(result);
         });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("Local Chef Bazar is running....");
});

app.listen(port, () => {
    console.log(`Local chef bazar in this  ${port}`);
});