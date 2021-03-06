import { withFilter } from 'graphql-subscriptions';
import { requiresAuth } from '../permissions';
import pubsub from '../pubsub';

const NEW_CHANNEL_MESSAGE = 'NEW_CHANNEL_MESSAGE';

export default {
  Query: {
    messages: requiresAuth.createResolver(
      async (parent, { cursor, channelId }, { models, user }) => {
        const channel = await models.Channel.findOne({ raw: true, where: { id: channelId } });

        if (!channel.public) {
          const member = await models.PCMember.findOne({
            raw: true,
            where: { channelId, userId: user.id }
          });

          if (!member) throw new Error('Not Authorized');
        }

        const options = {
          order: [['created_at', 'DESC']],
          where: { channelId },
          limit: 15
        };

        if (cursor) {
          options.where.created_at = {
            [models.op.lt]: cursor
          };
        }

        return models.Message.findAll(options, { raw: true });
      }
    )
  },
  Mutation: {
    createMessage: requiresAuth.createResolver(async (parent, args, { models, user }) => {
      try {
        const message = await models.Message.create({
          ...args,
          userId: user.id
        });

        const asyncFunc = async () => {
          const currentUser = await models.User.findOne({
            where: {
              id: user.id
            }
          });

          pubsub.publish(NEW_CHANNEL_MESSAGE, {
            channelId: args.channelId,
            newChannelMessage: {
              ...message.dataValues,
              user: currentUser.dataValues
            }
          });
        };

        asyncFunc();
        return true;
      } catch (err) {
        console.log(err);
        return false;
      }
    })
  },
  Subscription: {
    newChannelMessage: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(NEW_CHANNEL_MESSAGE),
        (payload, args) => payload.channelId === args.channelId
      )
    }
  },
  Message: {
    user: ({ user, userId }, args, { models }) => {
      if (user) {
        return user;
      }
      return models.User.findOne({ where: { id: userId } }, { raw: true });
    }
  }
};
