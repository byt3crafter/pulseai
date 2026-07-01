import ResetForm from "./ResetForm";

export default async function ResetPasswordPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    return <ResetForm token={token} />;
}
