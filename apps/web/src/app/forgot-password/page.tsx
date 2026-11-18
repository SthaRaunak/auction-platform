import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotForm } from '@/components/auth/AuthForms';

export const metadata = { title: 'Reset your password' };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" lead="We’ll email you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
