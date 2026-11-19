import type { Chapter } from '../types.js';
import c01 from './c01-linux.js';
import c02 from './c02-linux-admin.js';
import c03 from './c03-linux-net.js';
import c04 from './c04-virtualization.js';
import c05 from './c05-cloud-concepts.js';
import c06 from './c06-aws.js';
import c07 from './c07-cloud-networking.js';
import c08 from './c08-docker.js';
import c09 from './c09-kubernetes.js';
import c10 from './c10-devops.js';
import c11 from './c11-hpc.js';
import c12 from './c12-security-career.js';

/** Cloud Engineer stream: Linux -> virtualization -> cloud -> containers -> Kubernetes -> DevOps -> HPC -> security & career. */
export const CLOUD_CHAPTERS: Chapter[] = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12];
