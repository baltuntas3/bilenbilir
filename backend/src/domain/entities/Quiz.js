class Quiz {
  constructor({ id, title, description = '', createdBy, questions = [], isPublic = false, createdAt = new Date() }) {
    if (!id) {
      throw new Error('Quiz id is required');
    }
    if (!title || !title.trim()) {
      throw new Error('Quiz title is required');
    }
    if (!createdBy) {
      throw new Error('Quiz createdBy is required');
    }

    this.id = id;
    this.title = title.trim();
    this.description = description || '';
    this.createdBy = createdBy;
    this.questions = Array.isArray(questions) ? questions : [];
    this.isPublic = Boolean(isPublic);
    this.createdAt = createdAt;
  }

  updateTitle(newTitle) {
    if (!newTitle || !newTitle.trim()) {
      throw new Error('Quiz title is required');
    }
    this.title = newTitle.trim();
  }

  updateDescription(newDescription) {
    this.description = newDescription || '';
  }

  setPublic(isPublic) {
    this.isPublic = Boolean(isPublic);
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

  /**
   * Create a deep clone of this quiz (immutable snapshot for game sessions)
   * This prevents mid-game modifications from affecting ongoing games
   */
  clone() {
    return new Quiz({
      id: this.id,
      title: this.title,
      description: this.description,
      createdBy: this.createdBy,
      questions: this.questions.map(q => q.clone()),
      isPublic: this.isPublic,
      createdAt: this.createdAt
    });
  }
}

module.exports = { Quiz };
