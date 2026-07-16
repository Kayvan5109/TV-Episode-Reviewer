import type { Metadata } from 'next';

import { SignupForm } from './SignupForm';

export const metadata: Metadata = {
  title: 'Sign up — Episode Ranker',
};

export default function SignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign up</h1>
      <SignupForm />
    </div>
  );
}
