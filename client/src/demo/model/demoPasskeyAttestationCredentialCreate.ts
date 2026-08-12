function bufferFrom(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer
}

export function demoPasskeyAttestationCredentialCreate(): PublicKeyCredential {
  return {
    id: "demo-attestation",
    rawId: bufferFrom("demo-attestation"),
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: bufferFrom("{}"),
      attestationObject: bufferFrom("attestation"),
    } as AuthenticatorAttestationResponse,
    getClientExtensionResults: () => ({}),
    toJSON: () => ({}),
  } as unknown as PublicKeyCredential
}
