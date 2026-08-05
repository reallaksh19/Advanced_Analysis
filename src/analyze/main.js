import '../index.css';
import './analyze.css';
import { mountAnalyzePage } from './analyze-controller.js';

const applicationRoot = document.getElementById('root');
mountAnalyzePage(applicationRoot, document);
