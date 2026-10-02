import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SurveyFillForm from '../components/surveys/SurveyFillForm';

const SupportSurveyPage: React.FC = () => {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  if (!id) return null;
  return (
    <div className="max-w-[560px]">
      <PageHeader title={title || 'Survey'} back={{ label: 'Home', fallbackTo: '/support' }} />
      <SurveyFillForm surveyId={id} onLoaded={(s) => setTitle(s.title)} />
    </div>
  );
};

export default SupportSurveyPage;
