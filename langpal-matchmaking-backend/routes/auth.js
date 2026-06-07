const express = require("express");
const supabase = require("../supabaseClient");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticateUser = require("../middleware/authMiddleware");

// `display_name` is the app-level public name shown in LangPal Live.
// `first_name` and `last_name` are legacy compatibility fields kept for older
// clients/schema history; new public-name behavior should use `display_name`.
const PUBLIC_USER_COLUMNS = "id, email, display_name, first_name, last_name, native_language, practice_language, created_at";

function ensureAuthConfigured(res) {
    if (supabase && process.env.JWT_SECRET) {
        return true;
    }

    res.status(503).json({
        error: "Auth is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and JWT_SECRET."
    });
    return false;
}

function signBackendToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "1h"
        }
    );
}

function getPublicUser(user) {
    return {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        // Legacy compatibility fields. LangPal Live public UI uses display_name.
        first_name: user.first_name,
        last_name: user.last_name,
        native_language: user.native_language,
        practice_language: user.practice_language,
        created_at: user.created_at
    };
}

function getMetadataValue(metadata, keys) {
    for (const key of keys) {
        if (metadata?.[key]) return metadata[key];
    }

    return "";
}

async function findUserByEmail(email) {
    return supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();
}

function normalizeDisplayName(displayName) {
    if (typeof displayName !== "string") return "";
    return displayName.trim().replace(/\s+/g, " ");
}

// Legacy custom-auth routes.
//
// The current LangPal Live frontend uses Supabase Auth directly, then exchanges
// the Supabase session token through POST /auth/langpal-login for a backend JWT.
// Keep /auth/register and /auth/login for older clients/manual backend testing
// until the team confirms Supabase Auth is the only supported login path.

// POST /auth/register
router.post("/register", async (req, res) => {
    try {
        if (!ensureAuthConfigured(res)) return;

        // get email, password, and profile fields from request body
        const { email, password, firstName, lastName, nativeLanguage, practiceLanguage } = req.body;

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
                    password_hash: passwordHash,
                    display_name: firstName,
                    // Legacy compatibility fields for older custom-auth clients.
                    first_name: firstName,
                    last_name: lastName,
                    native_language: nativeLanguage,
                    practice_language: practiceLanguage
                }
            ])
            .select(PUBLIC_USER_COLUMNS)
            .single();
        
        // handle any insert errors
        if (insertError) {
            console.error("User insert error:", insertError);
            return res.status(500).json({
                error: "Error creating user."
            });
        }

        // generate JWT token for authenticated user
        const token = signBackendToken(newUser);

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
        const token = signBackendToken(existingUser);

        // return response with successful registration message
        return res.status(200).json({
            message: "Login successful.",
            token: token,
            user: getPublicUser(existingUser)
        });

    } catch(error) {

        // handle any unexpected server errors
        console.error(error);

        return res.status(500).json({
            error: "Server error."
        });
    }
});

// Current frontend auth bridge for Supabase email/password and Google OAuth.
// Verifies the Supabase session token, finds or creates the app-level users row,
// and returns the backend JWT used by matchmaking.

// POST /auth/langpal-login
router.post("/langpal-login", async (req, res) => {
    try {
        if (!ensureAuthConfigured(res)) return;

        const { token: supabaseToken } = req.body;

        if (!supabaseToken) {
            return res.status(400).json({
                error: "Supabase token is required."
            });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(supabaseToken);

        if (authError || !authData?.user) {
            console.error("Supabase token verification error:", authError);
            return res.status(401).json({
                error: "Invalid Supabase token."
            });
        }

        const authUser = authData.user;
        const email = authUser.email;

        if (!email) {
            return res.status(400).json({
                error: "Supabase user does not have an email address."
            });
        }

        const metadata = authUser.user_metadata || {};
        const displayName =
            getMetadataValue(metadata, ["displayName", "display_name", "full_name", "name"]) ||
            email.split("@")[0];
        const nativeLanguage = getMetadataValue(metadata, ["nativeLanguage", "native_language"]);
        const practiceLanguage = getMetadataValue(metadata, ["practiceLanguage", "practice_language"]);

        const { data: existingUser, error: existingUserError } = await findUserByEmail(email);

        if (existingUserError) {
            console.error("LangPal user lookup error:", existingUserError);
            return res.status(500).json({
                error: "Error checking existing user."
            });
        }

        let appUser = existingUser;

        if (!appUser) {
            const passwordHash = await bcrypt.hash(`supabase-auth:${authUser.id}`, 10);

            const { data: newUser, error: insertError } = await supabase
                .from("users")
                .insert([
                    {
                        email,
                        password_hash: passwordHash,
                        display_name: displayName,
                        // Legacy compatibility fields. Do not use these for public UI identity.
                        first_name: displayName,
                        last_name: "",
                        native_language: nativeLanguage,
                        practice_language: practiceLanguage
                    }
                ])
                .select(PUBLIC_USER_COLUMNS)
                .single();

            if (insertError) {
                if (
                    insertError.code === "23505" ||
                    insertError.message?.toLowerCase().includes("duplicate")
                ) {
                    const { data: duplicateUser, error: duplicateUserError } = await findUserByEmail(email);

                    if (!duplicateUserError && duplicateUser) {
                        appUser = duplicateUser;
                    } else {
                        console.error("LangPal duplicate user lookup error:", duplicateUserError || insertError);
                        return res.status(500).json({
                            error: "Error finding LangPal user."
                        });
                    }
                } else {
                    console.error("LangPal user insert error:", insertError);
                    return res.status(500).json({
                        error: "Error creating LangPal user."
                    });
                }
            }

            if (newUser) {
                appUser = newUser;
            }
        }

        const backendToken = signBackendToken(appUser);

        return res.status(200).json({
            message: "LangPal login successful.",
            token: backendToken,
            user: getPublicUser(appUser)
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Server error."
        });
    }
});

// PATCH /auth/me/display-name
router.patch("/me/display-name", (req, res, next) => {
    if (!ensureAuthConfigured(res)) return;
    next();
}, authenticateUser, async (req, res) => {
    try {
        const displayName = normalizeDisplayName(req.body.displayName);

        if (!displayName) {
            return res.status(400).json({
                error: "Display name is required."
            });
        }

        if (displayName.length > 60) {
            return res.status(400).json({
                error: "Display name must be 60 characters or fewer."
            });
        }

        const { data: updatedUser, error: updateError } = await supabase
            .from("users")
            .update({ display_name: displayName })
            .eq("id", req.user.id)
            .select(PUBLIC_USER_COLUMNS)
            .single();

        if (updateError) {
            console.error("Display name update error:", updateError);
            return res.status(500).json({
                error: "Error updating display name."
            });
        }

        await supabase
            .from("waiting_queue")
            .update({ display_name: displayName })
            .eq("user_id", req.user.id);

        return res.status(200).json({
            message: "Display name updated.",
            user: updatedUser
        });
    } catch (error) {
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
            .select(PUBLIC_USER_COLUMNS)
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
