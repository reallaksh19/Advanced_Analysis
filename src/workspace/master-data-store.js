export const MasterDataStore = {
  state: {
    lineList: [],
    pipingClasses: []
  },
  
  setLineList(data) {
    this.state.lineList = data;
  },
  
  setPipingClasses(data) {
    this.state.pipingClasses = data;
  },
  
  getLineList() {
    return this.state.lineList;
  },
  
  getPipingClasses() {
    return this.state.pipingClasses;
  }
};
