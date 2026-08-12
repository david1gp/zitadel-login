function bufferFrom(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer
}

export function demoPasskeyAssertionCredentialGet(): PublicKeyCredential {
  return {
    id: "demo-assertion",
    rawId: bufferFrom("demo-assertion"),
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: bufferFrom("{}"),
      authenticatorData: bufferFrom("authenticator"),
      signature: bufferFrom("signature"),
      userHandle: bufferFrom("user"),
    } as AuthenticatorAssertionResponse,
    getClientExtensionResults: () => ({}),
    toJSON: () => ({}),
  } as unknown as PublicKeyCredential
}
