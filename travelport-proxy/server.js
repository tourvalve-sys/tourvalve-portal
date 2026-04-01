const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// IMPORTANT: accept XML body
app.use(express.text({ type: "*/*" }));

const endpoint =
    process.env.TRAVELPORT_SYSTEM_ENDPOINT ||
    "https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/SystemService";

const username = process.env.TRAVELPORT_USERNAME;
const password = process.env.TRAVELPORT_PASSWORD;

function buildAuthHeader() {
    if (!username || !password) {
        return null;
    }

    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

app.post("/travelport/ping", async (req, res) => {
    const auth = buildAuthHeader();

    if (!auth) {
        return res.status(500).send(
            "Missing TRAVELPORT_USERNAME or TRAVELPORT_PASSWORD environment variables."
        );
    }

    try {
        const xml = req.body;

        console.log("XML RECEIVED FROM POSTMAN:");
        console.log(xml);

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": auth,
                "Content-Type": "text/xml",
                "SOAPAction": "PingReq",
                "Accept": "*/*"
            },
            body: xml
        });

        const data = await response.text();

        res.send(data);

    } catch (error) {

        console.error(error);
        res.status(500).send(error.toString());

    }

});

app.listen(PORT, () => {
    console.log(`Travelport proxy running on port ${PORT}`);
});
