import { canonicalNumber, maxAbs } from './numeric.js';
export function zeros(rows,columns){return Array.from({length:rows},()=>Array(columns).fill(0));}
export function transpose(matrix){return matrix[0].map((_,column)=>matrix.map((row)=>row[column]));}
export function multiply(left,right){const out=zeros(left.length,right[0].length);for(let i=0;i<left.length;i+=1)for(let k=0;k<right.length;k+=1)for(let j=0;j<right[0].length;j+=1)out[i][j]+=left[i][k]*right[k][j];return canonicalMatrix(out);}
export function matrixVector(matrix,vector){return matrix.map((row)=>canonicalNumber(row.reduce((sum,value,index)=>sum+value*vector[index],0),'matrix-vector product'));}
export function scaleMatrix(matrix,factor){return canonicalMatrix(matrix.map((row)=>row.map((value)=>value*factor)));}
export function dot(left,right){return canonicalNumber(left.reduce((sum,value,index)=>sum+value*right[index],0),'vector dot product');}
export function symmetryResidual(matrix){let residual=0;for(let i=0;i<matrix.length;i+=1)for(let j=i+1;j<matrix.length;j+=1)residual=Math.max(residual,Math.abs(matrix[i][j]-matrix[j][i]));return canonicalNumber(residual,'symmetry residual');}
export function matrixScale(matrix){return maxAbs(matrix);}
export function canonicalMatrix(matrix){return matrix.map((row)=>row.map((value)=>canonicalNumber(value,'matrix value')));}
