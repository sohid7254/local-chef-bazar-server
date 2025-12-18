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
        const reviewsCollection = db.collection("reviews")
        const favouriteCollection = db.collection("favourites")
        const ordersCollection = db.collection("orders")

        // ------------Reusable api---------
        // admin
        const verifyAdmin = async(req, res, next) => {
            try{
                const email = req.decoded_email;
                const user = await usersCollection.findOne({email});

                if(!user){
                    return res.status(404).send({error: "User not Found"})
                }
                if(user.role !== "admin"){
                    return res.status(403).send({error: "Admin Access denied"})
                }
                next()
            } catch(error){
                res.status(500).send({error: "Admin Verificatin failed"})
            }
        }
        // chef
        const verifyChef = async(req, res, next) =>{
            try {
                const email = req.decoded_email;
                const user = await usersCollection.findOne({email});

                if(!user){
                    return res.status(404).send({error: "User not found"})
                }
                if(user.role !== "chef"){
                    return res.status(403).send({error: "Chef access denied"})
                }
                next()
            } catch(error){
                res.status(500).send({error: "Chef verification failed "})
            }
        }
        // Fraud
        const verifyFraud = async (req, res, next) =>{
            try{
                const email = req.decoded_email;
                const user = await usersCollection.findOne({email});
                if(!user){
                    return res.status(404).send({error: "User not found"})
                }
                if(user.status === "fraud"){
                    return res.status(403).send({error: "Fraud user - action blocked"})
                }
                next()
            } catch(error){
                res.status(500).send({error: "Fraud verification fraud"})
            }
        }

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
        app.get("/users",verifyFBToken,verifyAdmin, async(req, res) => {
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
        app.patch("/users/fraud/:email",verifyFBToken,verifyAdmin, async (req, res) => {
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

        app.post("/requests",verifyFBToken, async (req, res) => {
            const request = req.body;
            request.requestStatus = "pending";
            request.requestTime = new Date();
            const result = await requestsCollection.insertOne(request);
            res.send(result);
        });

        app.get("/requests/:email", async (req, res) => {
            const email = req.params.email;

            const requests = await requestsCollection.find({ userEmail: email }).sort({ requestTime: -1 }).toArray();

            res.send(requests);
        });

        app.get("/requests",verifyFBToken,verifyAdmin, async (req, res) => {
            const requests = await requestsCollection.find().sort({ requestTime: -1 }).toArray();
            res.send(requests);
        });

        app.patch("/requests/update/:id",verifyFBToken,verifyAdmin, async (req, res) => {
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

        app.post("/meals", verifyFBToken,verifyFraud,verifyChef, async(req, res) =>{
            try{
                const meal = req.body;

                if(req.decoded_email !== meal.userEmail){
                    return res.status(403).send({error: "Access denied"})
                }
                meal.createdAt = new Date();

                const result = await mealsCollection.insertOne(meal)
                res.send({success: true, result})
            } catch(error) {
                res.status(500).send({success: false, error: "Failed to creat meal"})
            }
        })
        // get meals to show on home page
        app.get("/leatestMeals", async (req, res) => {
            const meals = await mealsCollection.find().sort({createdAt: -1}).limit(8).toArray();
            res.send(meals)
        })
        // Show meals Pagination
        app.get("/meals", async(req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page -1) * limit;
            const total = await mealsCollection.countDocuments();
            const meals = await mealsCollection
                .find()
                .sort({createdAt: -1})
                .skip(skip)
                .limit(limit)
                .toArray();
            res.send({total,page,limit,meals})
        })
        // showing meal details on frontend as per id
        app.get("/meals/:id",async (req, res) => {
            const id = req.params.id;
            const result = await mealsCollection.findOne({ _id: new ObjectId(id)});
            res.send(result)
        })
        // get meals by email 
        app.get("/meals/by-email/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;

            if(req.decoded_email !== email){
                return res.status(403).send({error: "Access Denied"})
            }
            const meals = await mealsCollection.find({userEmail: email}).sort({createdAt: -1}).toArray()
            res.send(meals)
        })
        // delete meals
        app.delete("/meals/:id", verifyFBToken,verifyChef, async(req, res) => {
            const id = req.params.id;
            const result = await mealsCollection.deleteOne({_id: new ObjectId(id)})
            res.send(result)
        })
        // update meals information by id
        app.patch("/meals/:id", verifyFBToken,verifyChef, async(req, res) => {
            const id = req.params.id;
            const updatedData = req.body;
            const result = await mealsCollection.updateOne(
                {_id: new ObjectId(id)},
                {$set: updatedData}
            )
            res.send({success: result.modifiedCount > 0})
        })
        // ---------Reviews api-----------------
        app.post("/reviews",verifyFBToken,verifyFraud, async (req, res) => {
            const review = req.body;
            const exists = await reviewsCollection.findOne({
                foodId: review.foodId,
                reviewerEmail: review.reviewerEmail,
            });
            if (exists) {
                return res.send({
                    success: false,
                    message: "Already you have added review to this meal",
                });
            }
            const result = await reviewsCollection.insertOne(review);
            const allReviews = await reviewsCollection.find({ foodId: review.foodId }).toArray();
            const total = allReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
            const avgRating = total / allReviews.length;
            if(!ObjectId.isValid(review.foodId)){
                return res.status(400).send({success: false, message: "Invalid foodId formate"})
            }
            const newFoodId = new ObjectId(review.foodId)
            await mealsCollection.updateOne({ _id: newFoodId }, { $set: { rating: Number(avgRating.toFixed(2)) } })
            res.send({
                success: true,
                insertedId: result.insertedId,
            });
        });
        app.get("/reviews/:mealId", async (req, res) => {
            const mealId = req.params.mealId;
            const reviews = await reviewsCollection.find({ foodId: mealId }).toArray();
            res.send(reviews);
        });
        app.get("/reviews", async(req, res) => {
            const review = await reviewsCollection.find().sort({date: -1}).limit(10).toArray();
            res.send(review)
        })
        app.get("/reviews/by-email/:email", verifyFBToken, async (req, res) => {
            const email = req.params.email;
            if(req.decoded_email !== email){
                return res.status(403).send({error: "Access Denied"})
            }
            const result = await reviewsCollection.find({ reviewerEmail: email }).toArray();
            res.send(result);
        });
        app.delete('/reviews/:id',verifyFBToken, async(req, res) => {
            const id = req.params.id;
            const review = await reviewsCollection.findOne({_id: new ObjectId(id)})
            const deleteResult = await reviewsCollection.deleteOne({_id: new ObjectId(id)})
            
            const givenReview = await reviewsCollection.find({foodId: review.foodId}).toArray()
            let newRating = 0;
            if(givenReview.length> 0){
                const total = givenReview.reduce(
                    (sum, r) => sum + Number(r.rating || 0),0
                )
                newRating = Number((total / givenReview.length ).toFixed(3))
            }

            await mealsCollection.updateOne(
                {_id: new ObjectId(review.foodId)},
                {$set: {rating: newRating}}
            )
            res.send({
                success: deleteResult.deletedCount > 0,
                message: "Review deleted Successfully",
            })
        })
        app.patch("/reviews/:id", verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const { rating, comment } = req.body;
            const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
            
            // Update review
            const updateReview = await reviewsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        rating: Number(rating),
                        comment,
                        date: new Date(),
                    },
                }
            );
            const allRatings = await reviewsCollection.find({ foodId: review.foodId }).toArray();

            let avgRating = 0;

            if (allRatings.length > 0) {
                const total = allRatings.reduce((sum, r) => sum + Number(r.rating || 0), 0);
                avgRating = Number((total / allRatings.length).toFixed(2));
            }

            await mealsCollection.updateOne({ _id: new ObjectId(review.foodId) }, { $set: { rating: avgRating } });

            res.send({
                success: true,
                message: "Review updated successfully",
            });
        });


        // --------fav api ---------
        app.post("/favorites",verifyFBToken,verifyFraud, async(req, res) => {
            const favourite = req.body;

            const exists = await favouriteCollection.findOne({
                userEmail: favourite.userEmail,
                mealId: favourite.mealId,
            })
            if(exists){
                return res.send({
                    success: false,
                    message: "Already added to favorite"
                })
            }
            favourite.addedTime = new Date();
            const result = await favouriteCollection.insertOne(favourite)
            res.send({
                success: true,
                insertedId: result.insertedIdz,
            })
        })
        app.get("/favorites/:email", verifyFBToken, async(req, res) => {
            const email = req.params.email;
            const result = await favouriteCollection.find({userEmail: email}).toArray();
            res.send(result)
        })
        app.delete("/favourites/:id", async(req, res) => {
            const id = req.params.id;
            const result = await favouriteCollection.deleteOne({_id: new ObjectId(id)});
            res.send(result)
        })
        // -----------------Order api----------------
        app.post("/orders",verifyFBToken,verifyFraud, async(req, res) => {
            const order = req.body;
            order.orderTime = new Date().toISOString();
            order.orderStatus = "pending",
            order.paymentStatus = "pending"
            const result = await ordersCollection.insertOne(order)
            res.send(result)
        })
        // get the order bessed on chefId
        app.get("/orders/by-chef/:chefEmail", async (req, res) => {
            const chefEmail = req.params.chefEmail;
            const orders = await ordersCollection.find({ chefEmail }).sort({ orderTime: -1 }).toArray();
            res.send(orders);
        });
        app.patch("/orders/update/:id",verifyFBToken,verifyChef,async(req,res) => {
            const id = req.params.id;
            const {status} = req.body;
            const allowed = ["pending", "accepted","cancelled", "delivered"];
            if(!allowed.includes(status)) {
                return res.status(400).send({error: "Invalid status"})
            }
            const result = await ordersCollection.updateOne(
                {_id : new ObjectId(id)},
                {$set: {orderStatus: status}}
            )
            res.send({ success: result.modifiedCount > 0})
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
