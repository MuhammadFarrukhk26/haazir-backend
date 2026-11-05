const Rating = require('../models/Rating');
const User = require('../models/User');

const updateUserRating = async (userId) => {
  const stats = await Rating.aggregate([
    { $match: { toUser: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$toUser',
        avgRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    const avg = Math.round(stats[0].avgRating * 100) / 100; // Round to 2 decimals
    await User.findByIdAndUpdate(userId, {
      rating: avg,
    });
  }
};

module.exports = updateUserRating;