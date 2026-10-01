import { SaasLaunchCta } from "../components/SaasLaunchCta";
import { SaasLaunchFeatures } from "../components/SaasLaunchFeatures";
import { SaasLaunchFooter } from "../components/SaasLaunchFooter";
import { SaasLaunchHero } from "../components/SaasLaunchHero";
import { SaasLaunchPricing } from "../components/SaasLaunchPricing";
import { SaasLaunchTestimonials } from "../components/SaasLaunchTestimonials";
import "./SaasLaunchShowcasePage.css";

export function SaasLaunchShowcasePage() { return <main className="saas-showcase" id="top"><SaasLaunchHero /><SaasLaunchFeatures /><SaasLaunchTestimonials /><SaasLaunchPricing /><SaasLaunchCta /><SaasLaunchFooter /></main>; }
