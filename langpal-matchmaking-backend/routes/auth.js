const express = require("express");
const supabase = require("../supabaseClient");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticateUser = require("../middleware/authMiddleware");

function ensureAuthConfigured(res) {
    if (supabase && process.env.JWT_SECRET) {
        return true;
    }

    res.status(503).json({
        error: "Auth is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and JWT_SECRET."
    });
    return false;
}

// POST /auth/register
router.post("/register", async (req, res) => {
    try {
        if (!ensureAuthConfigured(res)) return;

        // get email and password from request body
        const { email, password } = req.body;

        // safety checks
        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        // check to see if user already exists in database
        const { data: existingUser, error: existingUserError } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();
        
        // handle error statements if user already exists
        if (existingUserError) {
            console.error("Existing user check error:", existingUserError);
            return res.status(500).json({
                error: "Error checking existing user."
            });
        }

        // handle duplicate email registration entries
        if (existingUser) {
            return res.status(409).json({
                error: "Email already registered."
            });
        }

        // hash password before storing in database
        const passwordHash = await bcrypt.hash(password, 10);

        // insert new user into users table
        const { data: newUser, error: insertError } = await supabase
            .from("users")
            .insert([
                {
                    email: email,
                    password_hash: passwordHash
                }
            ])
            .select("id, email, created_at")
            .single();
        
        // handle any insert errors
        if (insertError) {
            console.error("User insert error:", insertError);
            return res.status(500).json({
                error: "Error creating user."
            });
        }

        // generate JWT token for authenticated user
        const token = jwt.sign(
            {
                id: newUser.id,
                email: newUser.email
            },

            // secret key used to sign token
            process.env.JWT_SECRET,

            // token expiration settings
            {
                expiresIn: "1h"
            }
        );

        // return response with successful registration message
        return res.status(201).json({
            message: "User registered successfully.",
            token: token,
            user: newUser
        });

    } catch (error) {

        // handle any unexpected server errors
        console.error(error);

        return res.status(500).json({
            error: "Server error."
        });
    }
});

// POST /auth/login
router.post("/login", async (req, res) => {
    try {
        if (!ensureAuthConfigured(res)) return;
        
        // get email and password from request body
        const { email, password } = req.body;

        // safety checks
        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        // find user by email
        const { data: existingUser, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .maybeSingle();
        
        // handle error statements
        if (userError) {
            console.error("User error:", userError);

            return res.status(500).json({
                error: "Error finding user."
            });
        }

        // check to see if user already exists in database
        if (!existingUser) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // compare entered password with hashed password
        const passwordMatch = await bcrypt.compare(
            password,
            existingUser.password_hash
        );

        // if password does not match, send an error message
        if (!passwordMatch) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // generate JWT token for authenticated user
        const token = jwt.sign(
            {
                id: existingUser.id,
                email: existingUser.email
            },

            process.env.JWT_SECRET,

            {
                expiresIn: "1h"
            }
        );

        // return response with successful registration message
        return res.status(200).json({
            message: "Login successful.",
            token: token,
            user: {
                id: existingUser.id,
                email: existingUser.email,
                created_at: existingUser.created_at
            }
        });

    } catch(error) {

        // handle any unexpected server errors
        console.error(error);

        return res.status(500).json({
            error: "Server error."
        });
    }
});

// GET /auth/me
router.get("/me", (req, res, next) => {
    if (!ensureAuthConfigured(res)) return;
    next();
}, authenticateUser, async (req, res) => {
    try {
        // find current authenticated user
        const { data: currentUser, error: userError } = await supabase
            .from("users")
            .select("id, email, created_at")
            .eq("id", req.user.id)
            .maybeSingle();
        
        // handle error statements
        if (userError) {
            console.error("Current user query error:", userError);

            return res.status(500).json({
                error: "Error fetching user."
            });
        }

        // handle missing user
        if (!currentUser) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        // return authenticated user data finally
        return res.status(200).json({
            user: currentUser
        });

    } catch(error) {

        // handle any unexpected server errors
        console.error(error);

        return res.status(500).json({
            error: "Server error."
        });
    }

});

// export router so server.js can use these routes
module.exports = router;
