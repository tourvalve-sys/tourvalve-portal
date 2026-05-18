import LoginClient from "./login-client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
    title: "Sign In",
};

export default function LoginPage() {
    return <LoginClient />;
}
