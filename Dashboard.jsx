import { useCallback, useState } from 'react';
import AuthDialog from './AuthDialog';
import ResetPasswordDialog from './ResetPasswordDialog';
import InfoDialog, { LANDING_TABS } from './InfoDialog';
import { LandingHero, LandingDirectory, TestimonialsView } from './LandingViews';
import './Dashboard.css';

/* ---------- dashboard ---------- */
export default function Dashboard({ onAuthSuccess }) {
  const [dialog, setDialog] = useState(null); // 'login' | 'register' | null
  const [landingView, setLandingView] = useState('poster'); // 'poster' | 'directory' | 'testimonials'
  const [infoTab, setInfoTab] = useState(null);
  const [bmiForm, setBmiForm] = useState({ age: '', heightIn: '', weightLb: '', sex: '', activity: 'light', goal: 'auto' });
  const [plan, setPlan] = useState(null); // validated BMI-form answers, sent along with the sign-up
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const open = useCallback((mode) => setDialog(mode), []);
  const close = useCallback(() => setDialog(null), []);

  const currentInfo = LANDING_TABS.find((t) => t.id === infoTab) || null;

  const handleBmiChange = (field, value) => {
    setBmiForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDirectoryBack = () => {
    setLandingView('poster');
    setInfoTab(null);
  };

  return (
    <div className="dashboard-stage">
      {landingView === 'directory' && (
        <LandingDirectory onSelect={setInfoTab} onBack={handleDirectoryBack} />
      )}

      {currentInfo && (
        <InfoDialog
          tab={currentInfo}
          bmiForm={bmiForm}
          onBmiChange={handleBmiChange}
          onClose={() => setInfoTab(null)}
          onCreatePlan={(profile) => {
            setPlan(profile);
            setInfoTab(null);
            open('register');
          }}
        />
      )}


      {landingView === 'testimonials' && (
        <TestimonialsView
          onBack={() => setLandingView('poster')}
          onRegister={() => open('register')}
        />
      )}

      {landingView === 'poster' && (
        <LandingHero
          onRegister={() => open('register')}
          onLogin={() => open('login')}
          onOverview={() => setLandingView('directory')}
          onTestimonials={() => setLandingView('testimonials')}
        />
      )}

      {dialog && (
        <AuthDialog
          mode={dialog}
          plan={plan}
          onClose={close}
          onSwitch={setDialog}
          onSuccess={(user) => {
            close();
            onAuthSuccess(user);
          }}
          onForgot={(email) => {
            setResetEmail(email);
            close();
            setResetOpen(true);
          }}
        />
      )}

      {resetOpen && (
        <ResetPasswordDialog
          initialEmail={resetEmail}
          onClose={() => setResetOpen(false)}
          onDone={() => {
            setResetOpen(false);
            open('login');
          }}
        />
      )}
    </div>
  );
}