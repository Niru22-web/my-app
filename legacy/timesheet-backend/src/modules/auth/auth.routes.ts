import { Router } from "express";
import { login, register, forgotPassword, validateResetToken, resetPassword, validateRegistrationToken, completeRegistration, changePassword, me } from "./auth.controller";
import { uploadProfileDocuments, completeEmployeeProfile } from "../employee/employeeProfile.controller";
import { handleMicrosoftCallback, getOutlookOAuthAuth } from "../email/email.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.get("/me", authenticate, me);
router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.get("/validate-reset-token", validateResetToken);
router.post("/reset-password", resetPassword);
router.get("/validate-registration-token", validateRegistrationToken);
router.post("/complete-registration", uploadProfileDocuments, completeEmployeeProfile);
router.post("/change-password", authenticate, changePassword);

// Microsoft OAuth initiation (public endpoint for OAuth flow)
router.get("/outlook", getOutlookOAuthAuth);

// Microsoft OAuth fallback routes
router.get("/microsoft/callback", handleMicrosoftCallback);
router.get("/outlook/callback", handleMicrosoftCallback);
router.get("/roles", (req, res) => {
  res.json([
    "Admin",
    "HR",
    "IT",
    "Accountant",
    "Employee",
    "Manager",
    "Partner",
    "ACCOUNTS"
  ]);
});


export default router;