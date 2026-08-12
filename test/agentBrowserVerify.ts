import { spawn } from "node:child_process"

async function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:${process.env.HOME}/.local/bin:${process.env.PATH}` },
    })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => {
      stdout += d.toString()
    })
    proc.stderr.on("data", (d) => {
      stderr += d.toString()
    })
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`Command ${cmd} ${args.join(" ")} failed with code ${code}:\n${stderr}\n${stdout}`))
    })
  })
}

function refGet(snapshot: string, regex: RegExp): string {
  const match = snapshot.match(regex)
  if (!match || !match[1]) {
    throw new Error(`Failed to find ref matching ${regex} in snapshot:\n${snapshot}`)
  }
  return `@${match[1]}`
}

async function main() {
  console.log("Starting agent-browser mock server...")
  const serverProc = spawn("bun", ["run", "test/agentBrowserServer.ts"], {
    cwd: "/home/david/adaptive/zitadel-login",
    stdio: "inherit",
  })

  await new Promise((r) => setTimeout(r, 1000))

  try {
    const flow = "AAAAAAAAAAAAAAAAAAAAAA"
    const mfaEmailUrl = `http://localhost:3001/login/mfa/email-otp?flow=${flow}`
    const mfaSmsUrl = `http://localhost:3001/login/mfa/sms-otp?flow=${flow}`

    console.log("=== Testing MFA Email OTP ===")
    console.log("1. Testing Navigation & Stage 1 (Explicit Send Code)...")
    await runCommand("agent-browser", ["open", mfaEmailUrl])
    let snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Stage 1:\n", snap)

    if (!snap.includes("Send code") || !snap.includes("Email code")) {
      throw new Error("Stage 1 UI missing expected heading or Send code button")
    }

    console.log("2. Testing Send Code Action -> Stage 2 Transition...")
    let sendBtnRef = refGet(snap, /button "Send code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", sendBtnRef])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Stage 2:\n", snap)

    if (!snap.includes("Verification code") || !snap.includes("Resend code")) {
      throw new Error("Stage 2 UI missing expected code input or Resend button")
    }

    console.log("3. Testing Resend Action...")
    let resendBtnRef = refGet(snap, /button "Resend code.*".*ref=(e\d+)/)
    console.log("Resend button ref found:", resendBtnRef)

    console.log("4. Testing Invalid Retry Code (99999999)...")
    let inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "99999999"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Invalid Retry:\n", snap)

    if (!snap.includes("invalid") && !snap.includes("expired")) {
      throw new Error("Invalid code error message not displayed")
    }

    console.log("5. Testing Deployed 8-Digit Code Success (12345678)...")
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "12345678"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Success:\n", snap)

    if (!snap.includes("Authorized successfully!")) {
      throw new Error("Authorization completion failed for 8-digit code")
    }

    console.log("6. Testing Additional-Factor Transition (77777777)...")
    await runCommand("agent-browser", ["open", mfaEmailUrl])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    sendBtnRef = refGet(snap, /button "Send code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", sendBtnRef])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "77777777"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Additional Factor:\n", snap)

    console.log("=== Testing MFA SMS OTP ===")
    console.log("1. Testing Navigation & Stage 1 (Explicit Send Code)...")
    await runCommand("agent-browser", ["open", mfaSmsUrl])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("SMS Snapshot Stage 1:\n", snap)

    if (!snap.includes("Send code") || !snap.includes("SMS code")) {
      throw new Error("SMS Stage 1 UI missing expected heading or Send code button")
    }

    console.log("2. Testing Send Code Action -> Stage 2 Transition...")
    sendBtnRef = refGet(snap, /button "Send code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", sendBtnRef])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("SMS Snapshot Stage 2:\n", snap)

    if (!snap.includes("SMS verification code") || !snap.includes("Resend code")) {
      throw new Error("SMS Stage 2 UI missing expected code input or Resend button")
    }

    console.log("3. Testing Resend Action...")
    resendBtnRef = refGet(snap, /button "Resend code.*".*ref=(e\d+)/)
    console.log("SMS Resend button ref found:", resendBtnRef)

    console.log("4. Testing Invalid Retry Code (99999999)...")
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "99999999"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("SMS Snapshot Invalid Retry:\n", snap)

    if (!snap.includes("invalid") && !snap.includes("expired")) {
      throw new Error("SMS Invalid code error message not displayed")
    }

    console.log("5. Testing Deployed 8-Digit Code Success (12345678)...")
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "12345678"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("SMS Snapshot Success:\n", snap)

    if (!snap.includes("Authorized successfully!")) {
      throw new Error("SMS Authorization completion failed for 8-digit code")
    }

    console.log("6. Testing Additional-Factor Transition (77777777)...")
    await runCommand("agent-browser", ["open", mfaSmsUrl])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    sendBtnRef = refGet(snap, /button "Send code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", sendBtnRef])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "77777777"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("SMS Snapshot Additional Factor:\n", snap)

    console.log("7. Testing Reload Safe State & Non-Persistence...")
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Reload:\n", snap)

    console.log("8. Testing Mobile Viewport & Accessibility...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Mobile & Dark Mode:\n", snap)

    console.log("7. Testing Reload Safe State & Non-Persistence...")
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Reload:\n", snap)

    console.log("8. Testing Mobile Viewport & Accessibility...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot Mobile & Dark Mode:\n", snap)

    console.log("=== Testing email OTP enrollment ===")
    const emailEnrollFlow = "GGGGGGGGGGGGGGGGGGGGGG"
    const emailEnrollUrl = `http://localhost:3001/login/mfa/email-otp?flow=${emailEnrollFlow}`

    console.log("1. Desktop enrollment requires explicit action...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["open", emailEnrollUrl])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment start:\n", snap)
    if (!snap.includes("Set up email codes")) {
      throw new Error("Email OTP enrollment start UI missing explicit set up action")
    }
    if (snap.includes('textbox "Verification code"')) {
      throw new Error("Email OTP enrollment exposed the code stage before explicit enrollment")
    }

    console.log("2. Enrollment advances straight to the code stage without a duplicate challenge...")
    const enrollEmailRef = refGet(snap, /button "Set up email codes".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", enrollEmailRef])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment code stage:\n", snap)
    if (!snap.includes("Verification code") || !snap.includes("Resend code")) {
      throw new Error("Email OTP enrollment did not reach the enrollment-aware code stage")
    }

    console.log("3. Resend stays available on the enrollment-aware code stage...")
    resendBtnRef = refGet(snap, /button "Resend code.*".*ref=(e\d+)/)
    console.log("Email enrollment resend ref found:", resendBtnRef)

    console.log("4. Invalid code keeps the code stage with accessible messaging...")
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "99999999"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment invalid code:\n", snap)
    if (!snap.includes("invalid") && !snap.includes("expired")) {
      throw new Error("Email OTP enrollment invalid-code message not displayed")
    }

    console.log("5. Mobile and dark mode enrollment rendering...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment mobile dark:\n", snap)

    console.log("6. Reload resumes authoritative code state and persists no code...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment reload:\n", snap)
    if (!snap.includes("Verification code") || snap.includes("Set up email codes") || snap.includes("99999999")) {
      throw new Error("Reloaded email OTP enrollment did not resume the authoritative code state")
    }

    console.log("7. Enrollment-to-completion ordering...")
    inputRef = refGet(snap, /textbox "Verification code".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", inputRef, "12345678"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot email enrollment completion:\n", snap)
    if (!snap.includes("Authorized successfully!")) {
      throw new Error("Email OTP enrollment did not complete authorization after verification")
    }

    console.log("=== Testing U2F/passkey enrollment ===")
    const enrollFlow = "FFFFFFFFFFFFFFFFFFFFFF"
    const resumedSetupFlow = "EEEEEEEEEEEEEEEEEEEEEE"
    const enrollUrl = `http://localhost:3001/login/mfa/u2f?flow=${enrollFlow}`

    console.log("1. Desktop enrollment requires explicit action...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["open", enrollUrl])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot enrollment start:\n", snap)
    if (!snap.includes("Set up a security key") || !snap.includes("Register security key")) {
      throw new Error("U2F enrollment start UI missing heading or explicit register button")
    }

    console.log("2. Registration ceremony starts only on explicit action and blocks duplicates...")
    const registerRef = refGet(snap, /button "Register security key".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", registerRef])
    await new Promise((r) => setTimeout(r, 1500))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot registration in flight:\n", snap)
    if (!snap.includes("Registering...") && !snap.includes("Register security key")) {
      throw new Error("Enrollment panel lost its registration action")
    }

    console.log("3. Reload keeps enrollment view-only and persists no registration material...")
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot enrollment reload:\n", snap)
    if (snap.includes("GAOHYz2jE69kJMYo6Laij8yWw9")) {
      throw new Error("Registration challenge leaked into the reloaded page")
    }

    console.log("4. Mobile and dark mode enrollment rendering...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot enrollment mobile dark:\n", snap)

    console.log("5. Resumed mfa_webauthn_setup is authoritative and offers only safe fallback...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["open", `http://localhost:3001/login/mfa/u2f?flow=${resumedSetupFlow}`])
    await new Promise((r) => setTimeout(r, 800))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot resumed setup:\n", snap)
    if (!snap.includes("Continue in ZITADEL") || snap.includes("Register security key")) {
      throw new Error("Resumed WebAuthn setup did not offer fallback-only handling")
    }

    console.log("=== Testing standalone password recovery ===")
    const forgotUrl = "http://localhost:3001/password/forgot"

    console.log("1. Password sign-in exposes the capability-gated recovery entry...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["open", "http://localhost:3001/login/password?authRequest=request-1"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot password sign-in:\n", snap)
    if (!snap.includes("Forgot password?")) {
      throw new Error("Password sign-in did not expose the permitted recovery entry")
    }

    console.log("2. Recovery entry navigates to the canonical standalone request route...")
    const forgotRef = refGet(snap, /button "Forgot password\?".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", forgotRef])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot recovery request:\n", snap)
    if (!snap.includes("Reset your password") || !snap.includes("Email address")) {
      throw new Error("Standalone recovery request panel did not render")
    }

    console.log("3. Keyboard submission returns identical confirmation copy...")
    let emailRef = refGet(snap, /textbox "Email address".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", emailRef, "known@example.com"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot recovery accepted:\n", snap)
    if (!snap.includes("Check your email") || !snap.includes("If an account matches that email address")) {
      throw new Error("Recovery confirmation copy missing")
    }

    console.log("4. Unknown accounts return the same confirmation, on mobile and dark mode...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    await runCommand("agent-browser", ["open", forgotUrl])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    emailRef = refGet(snap, /textbox "Email address".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", emailRef, "unknown@example.com"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot recovery accepted (unknown, mobile dark):\n", snap)
    if (!snap.includes("Check your email") || snap.includes("unknown@example.com")) {
      throw new Error("Recovery outcome leaked account existence or submitted email")
    }

    console.log("5. Reloading the request route restarts a clean bootstrap...")
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot recovery reload:\n", snap)
    if (!snap.includes("Email address") || snap.includes("unknown@example.com")) {
      throw new Error("Reloaded recovery request kept prior input or state")
    }

    console.log("6. Invalid reset link renders the terminal invalid state...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", [
      "open",
      "http://localhost:3001/api/v2/password/reset/ingress?userId=user-1&orgId=org-1&code=expired-code",
    ])
    await new Promise((r) => setTimeout(r, 1000))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot invalid reset link:\n", snap)
    if (!snap.includes("This reset link is no longer valid") || snap.includes("New password")) {
      throw new Error("Invalid reset link did not render the terminal state")
    }

    console.log("7. Valid reset link renders the reset panel and scrubs credentials from the URL...")
    await runCommand("agent-browser", [
      "open",
      "http://localhost:3001/api/v2/password/reset/ingress?userId=user-1&orgId=org-1&code=valid-code",
    ])
    await new Promise((r) => setTimeout(r, 1000))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot reset panel:\n", snap)
    if (!snap.includes("Choose a new password") || snap.includes("valid-code")) {
      throw new Error("Reset panel did not render or leaked the verification code")
    }

    console.log("8. Local confirmation mismatch sends no request...")
    let newPasswordRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    let confirmRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", newPasswordRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmRef, "Different!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 600))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot mismatch:\n", snap)
    if (!snap.includes("The passwords do not match.")) {
      throw new Error("Confirmation mismatch was not checked locally")
    }

    console.log("9. Policy failure stays retryable with rotated CSRF and cleared fields...")
    newPasswordRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", newPasswordRef, "weak"])
    await runCommand("agent-browser", ["fill", confirmRef, "weak"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot policy retry:\n", snap)
    if (!snap.includes("does not meet the password policy") || !snap.includes("Choose a new password")) {
      throw new Error("Policy failure did not remain retryable")
    }

    console.log("10. Reload keeps the reset panel resumable without persisted secrets...")
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot reset reload:\n", snap)
    if (!snap.includes("Choose a new password") || snap.includes("weak")) {
      throw new Error("Reloaded reset panel leaked or lost state")
    }

    console.log("11. Successful reset returns to sign-in without auto-authentication...")
    newPasswordRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", newPasswordRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot reset success:\n", snap)
    if (!snap.includes("Your password was changed") || snap.includes("Authorized successfully!")) {
      throw new Error("Successful reset did not stop before authentication")
    }

    const backRef = refGet(snap, /button "Back to sign-in".*ref=(e\d+)/)
    await runCommand("agent-browser", ["click", backRef])
    await new Promise((r) => setTimeout(r, 1000))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot back to sign-in:\n", snap)
    if (snap.includes("Your password was changed")) {
      throw new Error("Back to sign-in did not leave the reset screen")
    }

    console.log("=== Testing required password change ===")
    const explicitChangeFlow = "HHHHHHHHHHHHHHHHHHHHHH"
    const expiredChangeFlow = "IIIIIIIIIIIIIIIIIIIIII"
    const partialChangeFlow = "JJJJJJJJJJJJJJJJJJJJJJ"
    const explicitChangeUrl = `http://localhost:3001/login/password?flow=${explicitChangeFlow}`

    console.log("1. Explicit required change renders all three mandatory fields without a bypass...")
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["open", explicitChangeUrl])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot explicit required change:\n", snap)
    if (
      !snap.includes("Change your password") ||
      !snap.includes("Your password must be changed before you continue.")
    ) {
      throw new Error("Explicit required password change did not render its concise copy")
    }
    if (
      !snap.includes("Current password") ||
      !snap.includes("New password") ||
      !snap.includes("Confirm new password")
    ) {
      throw new Error("Required password change is missing mandatory fields")
    }
    if (snap.includes("Back to methods") || snap.includes("Choose a method") || snap.includes("Forgot password?")) {
      throw new Error("Required password change exposed a chooser or recovery bypass")
    }

    console.log("2. Local confirmation mismatch sends no request...")
    let currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    let nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    let confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "old-password"])
    await runCommand("agent-browser", ["fill", nextRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "Different!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 600))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change mismatch:\n", snap)
    if (!snap.includes("The passwords do not match.")) {
      throw new Error("Required change confirmation mismatch was not checked locally")
    }

    console.log("3. Wrong current password stays retryable with rotated CSRF...")
    currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "wrong-password"])
    await runCommand("agent-browser", ["fill", nextRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot wrong current password:\n", snap)
    if (!snap.includes("Your current password is incorrect.") || !snap.includes("Change your password")) {
      throw new Error("Wrong current password did not remain retryable")
    }

    console.log("4. Policy failure stays retryable on the rotated CSRF token...")
    currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "old-password"])
    await runCommand("agent-browser", ["fill", nextRef, "weak"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "weak"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change policy retry:\n", snap)
    if (!snap.includes("does not meet the password policy") || !snap.includes("Change your password")) {
      throw new Error("Policy failure did not remain retryable on required change")
    }

    console.log("5. Mobile, dark mode and reload keep the screen blank and resumable...")
    await runCommand("agent-browser", ["set", "viewport", "375", "667"])
    await runCommand("agent-browser", ["set", "media", "dark"])
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change mobile dark:\n", snap)
    await runCommand("agent-browser", ["set", "viewport", "1280", "800"])
    await runCommand("agent-browser", ["set", "media", "light"])
    await runCommand("agent-browser", ["reload"])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change reload:\n", snap)
    if (!snap.includes("Change your password") || snap.includes("old-password") || snap.includes("weak")) {
      throw new Error("Reloaded required change leaked or lost state")
    }

    console.log("6. Keyboard completion finishes authorization...")
    currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "old-password"])
    await runCommand("agent-browser", ["fill", nextRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 1000))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change completion:\n", snap)
    if (!snap.includes("Authorized successfully!")) {
      throw new Error("Required password change did not complete authorization")
    }

    console.log("7. Expired required change hands off to MFA...")
    await runCommand("agent-browser", ["open", `http://localhost:3001/login/password?flow=${expiredChangeFlow}`])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot expired required change:\n", snap)
    if (!snap.includes("Your password has expired. Set a new password to continue.")) {
      throw new Error("Expired required change did not render the expiry copy")
    }
    currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "old-password"])
    await runCommand("agent-browser", ["fill", nextRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 1200))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot change to MFA:\n", snap)
    if (!snap.includes("Authenticator code") && !snap.includes("2-Step Verification")) {
      throw new Error("Required change did not hand off to MFA continuation")
    }

    console.log("8. Partial success offers only native fallback and never resubmits...")
    await runCommand("agent-browser", ["open", `http://localhost:3001/login/password?flow=${partialChangeFlow}`])
    await new Promise((r) => setTimeout(r, 900))
    snap = await runCommand("agent-browser", ["snapshot"])
    currentRef = refGet(snap, /textbox "Current password".*ref=(e\d+)/)
    nextRef = refGet(snap, /textbox "New password".*ref=(e\d+)/)
    confirmChangeRef = refGet(snap, /textbox "Confirm new password".*ref=(e\d+)/)
    await runCommand("agent-browser", ["fill", currentRef, "old-password"])
    await runCommand("agent-browser", ["fill", nextRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["fill", confirmChangeRef, "Str0ng-password!"])
    await runCommand("agent-browser", ["press", "Enter"])
    await new Promise((r) => setTimeout(r, 1200))
    snap = await runCommand("agent-browser", ["snapshot"])
    console.log("Snapshot partial success fallback:\n", snap)
    if (!snap.includes("Continue in ZITADEL fallback") || snap.includes("Change your password")) {
      throw new Error("Partial-success required change did not hand off to native fallback")
    }

    await runCommand("agent-browser", ["close"])
    console.log("Agent-browser verification completed successfully!")
  } finally {
    serverProc.kill()
  }
}

main().catch((err) => {
  console.error("Verification failed:", err)
  process.exit(1)
})
