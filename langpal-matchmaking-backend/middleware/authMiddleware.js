const jwt = require("jsonwebtoken");

const authenticateUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // safety check to ensure the token exists
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Authorization token missing"
            });
        }

        const token = authHeader.split(" ")[1]; // split token

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            error: "Invalid token"
        });
    }
};

module.exports = authenticateUser;