import React,{useEffect,useState} from 'react';
import {avatarSource,avatarInitials} from '../../utils/avatar.js';
import '../../styles/user-avatar.css';

export default function UserAvatar({src,name='',size=42}) {
  const source=avatarSource(src);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[source]);
  const initials=avatarInitials(name);
  const palette=['#dcece4','#e9e5f1','#f1e5d7','#dfe9f2','#f0e1e4'];
  const tone=Array.from(String(name)).reduce((sum,ch)=>sum+ch.codePointAt(0),0)%palette.length;
  return <span className="account-avatar" role="img" aria-label={name||'Avatar'} style={{'--avatar-size':`${size}px`,'--avatar-background':palette[tone]}}>
    {source&&!failed?<img src={source} alt="" decoding="async" onError={()=>setFailed(true)}/>:<span aria-hidden="true">{initials}</span>}
  </span>;
}
