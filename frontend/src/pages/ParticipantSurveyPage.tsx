import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SurveyFillForm from '../components/surveys/SurveyFillForm';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';

const ParticipantSurveyPage: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { reload } = useParticipantApp();
  const [title, setTitle] = useState('');
  if (!id) return null;
  return (
    <div className="max-w-[480px]">
      <PageHeader title={title || 'Survey'} back={{ label: 'Home', fallbackTo: '/me' }} />
      <SurveyFillForm
        surveyId={id}
        participantName={user?.name || ''}
        onLoaded={(s) => setTitle(s.title)}
        onSubmitted={() => { void reload(); }}
        doneNote="Thank you. Your answers have been sent to the FOF team."
      />
    </div>
  );
};

export default ParticipantSurveyPage;
