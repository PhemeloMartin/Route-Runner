import type { Chapter } from '../types.js';
import d01 from './d01-foundations.js';
import d02 from './d02-git.js';
import d03 from './d03-flutter-widgets.js';
import d04 from './d04-flutter-state.js';
import d05 from './d05-flutter-data.js';
import d06 from './d06-aspnet-api.js';
import d07 from './d07-efcore.js';
import d08 from './d08-aspnet-secure.js';
import d09 from './d09-devops-ci.js';
import d10 from './d10-devops-cd.js';
import d11 from './d11-k8s-workloads.js';
import d12 from './d12-k8s-platform.js';
import d13 from './d13-capstone.js';

/** App & DevOps stream: foundations -> Git -> Flutter -> ASP.NET Core -> DevOps -> Kubernetes deep dive -> capstone. */
export const DEV_CHAPTERS: Chapter[] = [d01, d02, d03, d04, d05, d06, d07, d08, d09, d10, d11, d12, d13];
