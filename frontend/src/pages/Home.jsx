import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiMic, FiMessageCircle, FiCompass, FiCheck } from 'react-icons/fi';
import api from '../api';
import Brand from '../components/common/Brand.jsx';
import { TranslationToggle, UiText } from '../i18n/UiLanguage.jsx';
import '../styles/home-refresh.css';

export default function Home() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const c = new AbortController(); setLoading(true); setFailed(false);
    api.get('/packages/public', {signal:c.signal, timeout:12000}).then(({data}) => {
      const rows=Array.isArray(data)?data:data?.packages;
      if(!Array.isArray(rows))throw Error('Invalid package list');
      if(!c.signal.aborted)setPackages(rows);
    }).catch(()=>{if(!c.signal.aborted)setFailed(true);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return ()=>c.abort();
  },[attempt]);
  async function requestAccess(e) {
    e.preventDefault(); if(sending.current || uncertain)return;
    const form=e.currentTarget;
    const fields=new FormData(form);
    sending.current=true;setBusy(true);setStatus('');
    try {
      await api.post('/admin/support',{name:fields.get('name'),email:fields.get('email'),phone:fields.get('phone'),note:'Access request from AESP home page'},{timeout:15000});
      setStatus('Request sent. An administrator will review your details.');form.reset();
    } catch(error) {
      const rejected=error.response?.status>=400&&error.response.status<500&&error.response.status!==408;
      setUncertain(!rejected);
      setStatus(rejected?'Please check your details and try again.':'Your request could not be confirmed. Please contact your administrator before sending it again.');
    }
    finally {sending.current=false;setBusy(false);}
  }
  return <div className="home-refresh">
    <header className="public-header"><Link to="/" aria-label="AESP home"><Brand /></Link>
      <nav aria-label="Main navigation"><a href="#practice"><UiText text="Features" /></a><a href="#packages"><UiText text="Learning packages" /></a><TranslationToggle /><Link to="/login" className="btn btn-primary"><UiText text="Sign in" /><FiArrowUpRight aria-hidden="true" /></Link></nav>
    </header>
    <main>
      <section className="public-hero">
        <div><p className="public-eyebrow"><UiText text="Everyday English" /></p><h1><UiText text="Make English part of your day." /></h1>
          <p className="public-intro"><UiText text="A few minutes to speak, tell a story and try a new conversation." /></p>
          <div className="public-actions"><Link to="/login" className="btn btn-primary"><UiText text="Get started" /><FiArrowUpRight aria-hidden="true" /></Link><a href="#practice"><UiText text="Explore practice" /></a></div>
          <div className="public-note"><FiCheck aria-hidden="true" /><UiText text="Practice at your own pace." /></div>
        </div>
        <div className="public-scene" aria-label="Conversation preview">
          <div className="preview-caption"><span className="preview-dot" /><UiText text="A little practice. A more confident you." /></div>
          <div className="preview-bubble preview-bubble-peer"><UiText text={"How was your day?"} /></div>
          <div className="preview-bubble preview-bubble-own"><UiText text={"I tried something new today."} /></div>
          <div className="preview-bubble preview-bubble-peer"><UiText text={"I'd love to hear about it."} /></div>
          <div className="preview-mic"><FiMic aria-hidden="true" /><span><UiText text="Find your words." /></span></div>
        </div>
      </section>
      <section id="practice" className="public-section"><div className="public-section-heading"><p className="public-eyebrow"><UiText text="Small steps. Every day." /></p><h2><UiText text="Your space to keep learning." /></h2></div>
        <div className="public-features">{[
          {icon:FiMic,title:'Speaking',description:'Listen, try and find your own words.'},
          {icon:FiMessageCircle,title:'Tell me your story',description:'Share an idea or talk about your day.'},
          {icon:FiCompass,title:'Scenario Studio',description:'Meet a character, ask a question and choose your next step.'}
        ].map(({icon:Icon,title,description})=><article key={title}><span className="public-feature-icon"><Icon aria-hidden="true" /></span><h3><UiText text={title} /></h3><p><UiText text={description} /></p><Link to="/login" aria-label={`Open ${title}`}><FiArrowUpRight aria-hidden="true" /></Link></article>)}</div>
      </section>
      <section id="packages" className="public-section"><div className="public-section-heading"><p className="public-eyebrow"><UiText text="Learning packages" /></p><h2><UiText text="Choose your next step." /></h2></div>
        {loading?<p role="status"><UiText text="Loading packages..." /></p>:failed?<div role="alert"><UiText text="Learning packages could not be loaded." /> <button className="btn" onClick={()=>setAttempt(n=>n+1)}><UiText text="Try again" /></button></div>:packages.length===0?<p><UiText text="No learning packages available yet." /></p>:<div className="public-package-grid">{packages.map(pkg=><article key={pkg.id} className="public-package"><h3>{pkg.name}</h3><p className="public-package-price">{Number.isFinite(Number(pkg.price))&&pkg.price!==null?new Intl.NumberFormat('en-GB',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(pkg.price)):<UiText text="Contact your administrator" />}</p><p>{Number.isSafeInteger(pkg.duration_days)&&pkg.duration_days>0?<>{pkg.duration_days} <UiText text="days" /></>:<UiText text="See package details" />}</p><p>{pkg.description}</p><a href="#access" className="btn btn-ghost"><UiText text="Request access" /><FiArrowUpRight aria-hidden="true" /></a></article>)}</div>}
      </section>
      <section id="access" className="public-access"><div><p className="public-eyebrow"><UiText text={"AESP"} /></p><h2><UiText text="Ready when you are." /></h2><p><UiText text="Accounts are provided by your administrator. Contact them to get started." /></p></div>
        <form onSubmit={requestAccess}><label><UiText text="Full name" /><input name="name" required maxLength={100} autoComplete="name" /></label><label><UiText text={"Email"} /><input name="email" type="email" required maxLength={200} autoComplete="email" /></label><label><UiText text="Phone number" /><input name="phone" type="tel" required maxLength={20} autoComplete="tel" /></label><button disabled={busy||uncertain} className="btn btn-primary"><UiText text={busy?'Sending...':'Send request'} /></button>{status&&<p role="status"><UiText text={status} /></p>}</form>
      </section>
    </main>
    <footer className="public-footer"><Brand /><span>AI Education Support Platform</span><Link to="/login"><UiText text="Back to learning" /> <FiArrowUpRight aria-hidden="true" /></Link></footer>
  </div>;
}
