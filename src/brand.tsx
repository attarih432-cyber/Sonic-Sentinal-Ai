export function Logo({large}:{large?:boolean}){
  return <div className={large?'brand brand-lg':'brand'}><div className="brandmark" aria-hidden="true"><span/><span/><span/><span/></div><div className="brandtype"><b>Sonic<span>Sentinel</span></b><small>ACOUSTIC THREAT INTEL</small></div></div>;
}
