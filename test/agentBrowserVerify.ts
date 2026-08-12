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
