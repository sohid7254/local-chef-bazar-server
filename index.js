const express = require("express");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const cors = require("cors");
const app = express();
require("dotenv").config();
// midle ware
app.use(cors());
app.use(express.json());

var admin = require("firebase-admin");

var serviceAccount = require(process.env.FIREBASE_ADMIN_SDK_PATH);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async(req, res, next) => {
    const token = req.headers.authorization;

    if(!token){
        return res.status(401).send({ message: "Unauthorized" });
    }
    try {
        const idToken = token.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.decoded_email = decoded.email;

        next()
    } catch(error) {
        return res.status(401).send({ message: "Unauthorized access" });
    }
}

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
        const mealsCollection = db.collection("meals")

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
        // get all users on frontend
        app.get("/users", async(req, res) => {
            const allUsers = await usersCollection.find().sort({createdAt: -1}).toArray();
            res.send(allUsers)
        })
        // role based access
        app.get("/users/:email/role", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role });
        });
        // updated user status 
        app.patch("/users/fraud/:email", async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.updateOne(
                {email},
                {$set: {status: "fraud"}}
            )

            if(result.modifiedCount > 0){
                return res.send({success: true})
            }

            res.send({success: false})
        })

        // showing users on my profile page on frontend
        app.get("/users/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;
            if(req.decoded_email !== email){
                return res.status(403).send({error: "Access Denied"})
            }
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

        app.get("/requests/:email", async (req, res) => {
            const email = req.params.email;
            const request = await requestsCollection.findOne({
                userEmail: email,
                requestStatus: "pending",
            });
            res.send(request || {});
        });

        app.get("/requests", async (req, res) => {
            const requests = await requestsCollection.find().sort({ requestTime: -1 }).toArray();
            res.send(requests);
        });

        app.patch("/requests/update/:id", async (req, res) => {
            const id = req.params.id;
            const { requestStatus, userEmail, requestType } = req.body;
            
            const requestUpdate = await requestsCollection.updateOne({ _id: id }, { $set: { requestStatus } });
    
            if (requestUpdate.modifiedCount === 0) {
                return res.send({ success: false, message: "Request update failed" });
            }
            if (requestStatus === "approved") {
                let updateData = {};
                if (requestType === "chef") {
                    const chefId = "chef-" + Math.floor(1000 + Math.random() * 9000);
                    updateData = { role: "chef", chefId };
                }
                if (requestType === "admin") {
                    updateData = { role: "admin" };
                }
                const userUpdate = await usersCollection.updateOne({ email: userEmail }, { $set: updateData });
                console.log("User Update:", userUpdate);
                if (userUpdate.modifiedCount === 0) {
                    return res.send({ success: false, message: "User role update failed" });
                }
            }
            return res.send({ success: true, message: "Request processed successfully" });
        });

        // ---------------Meals api---------------

        app.post("/meals", verifyFBToken, async(req, res) =>{
            try{
                const meal = req.body;

                if(req.decoded_email !== meal.userEmail){
                    return res.status(403).send({error: "Access denied"})
                }
                const chef = await usersCollection.findOne({email: meal.userEmail});
                if(chef.status === "fraud"){
                    return res.status(403).send({error: "Fraud chefs cannot create meals"})
                }
                
                meal.createdAt = new Date();

                const result = await mealsCollection.insertOne(meal)
                res.send({success: true, result})
            } catch(error) {
                res.status(500).send({success: false, error: "Failed to creat meal"})
            }
        })
        // get meals by email 
        app.get("/meals/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;

            if(req.decoded_email !== email){
                return res.status(403).send({error: "Access Denied"})
            }
            const meals = await mealsCollection.find({userEmail: email}).sort({createdAt: -1}).toArray()
            res.send(meals)
        })

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
