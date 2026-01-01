class Quiz {
  constructor({ id, title, description = '', createdBy, questions = [], isPublic = false, createdAt = new Date() }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.createdBy = createdBy;
    this.questions = questions;
    this.isPublic = isPublic;
    this.createdAt = createdAt;
  }

  addQuestion(question) {
    this.questions.push(question);
  }

  removeQuestion(questionId) {
    this.questions = this.questions.filter(q => q.id !== questionId);
  }

  getQuestion(index) {
    if (index < 0 || index >= this.questions.length) {
      return null;
    }
    return this.questions[index];
  }

  getTotalQuestions() {
    return this.questions.length;
  }

  reorderQuestions(newOrder) {
    const reordered = newOrder.map(id => this.questions.find(q => q.id === id));
    if (reordered.some(q => !q)) {
      throw new Error('Invalid question order');
    }
    this.questions = reordered;
  }
}

module.exports = { Quiz };
