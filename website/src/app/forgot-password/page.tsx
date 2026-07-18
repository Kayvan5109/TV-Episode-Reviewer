import type { Metadata } from 'next';

import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot password — Episode Ranker',
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <ForgotPasswordForm />
    </div>
  );
}
