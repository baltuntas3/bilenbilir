class Player {
  constructor({ id, socketId, nickname, roomPin, score = 0, streak = 0, joinedAt = new Date() }) {
    this.id = id;
    this.socketId = socketId;
    this.nickname = nickname;
    this.roomPin = roomPin;
    this.score = score;
    this.streak = streak;
    this.joinedAt = joinedAt;
    this.currentAnswer = null;
  }

  addScore(points) {
    this.score += points;
  }

  incrementStreak() {
    this.streak++;
  }

  resetStreak() {
    this.streak = 0;
  }

  getStreakBonus() {
    if (this.streak <= 1) return 0;
    return (this.streak - 1) * 100;
  }

  submitAnswer(answerIndex, timestamp) {
    this.currentAnswer = {
      answerIndex,
      timestamp,
      submittedAt: new Date()
    };
  }

  clearCurrentAnswer() {
    this.currentAnswer = null;
  }

  updateSocketId(newSocketId) {
    this.socketId = newSocketId;
  }
}

module.exports = { Player };
