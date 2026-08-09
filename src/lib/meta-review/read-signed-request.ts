export async function readSignedRequestFromBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const value = formData.get("signed_request");
    return typeof value === "string" ? value : null;
  }

  const bodyText = await request.text();
  if (!bodyText) {
    return null;
  }

  return new URLSearchParams(bodyText).get("signed_request");
}
